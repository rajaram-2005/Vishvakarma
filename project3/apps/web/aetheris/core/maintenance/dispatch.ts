/**
 * Maintenance dispatch.
 *
 *   A write-side composer that takes a maintenance entry
 *   and a confirmed dispatch window, validates it against
 *   the existing maintenance calendar, and writes a
 *   dispatch record to the 'maintenance-dispatches'
 *   collection.
 *
 *   Validation rules (all honest, all from real data):
 *     - the twin must exist and be owned by the user
 *     - the window must be in the future
 *     - the window must not overlap an existing dispatch
 *       for the same twin (within a 4-hour tolerance)
 *     - if a 'nextDue' timestamp is supplied, the window
 *       must be no more than 30 days after it
 *
 *   The function records an observability event of type
 *   'permission' / 'tool' with capability
 *   'maintenance:dispatch'. The dispatch write requires
 *   'safe_write' or higher; the API route enforces that.
 */

import { getTwin, listTwins } from "@/aetheris/core/twins/twins";
import { record } from "@/aetheris/core/observability/events";
import { store } from "@/aetheris/lib/store";
import { maintenanceCalendar } from "@/aetheris/core/maintenance/calendar";

const COL = "maintenance-dispatches";

export type DispatchPriority = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export interface DispatchRow {
  id: string;
  twinId: string;
  twinName: string;
  note: string;
  nextDue: number | null;
  daysUntilDue: number | null;
  nextDueIn: number | null;
  priority: DispatchPriority;
  reason: string;
  action: string;
  maintenanceNote: string | null;
  lastDiagnostic: { severity: string; topFault: string | null } | null;
  boundBreaches: { total: number; critical: number };
}

export interface DispatchList {
  uid: string;
  total: number;
  byPriority: Record<DispatchPriority, number>;
  rows: DispatchRow[];
  generatedAt: number;
}

export interface DispatchRequest {
  uid: string;
  twinId: string;
  /** The planned dispatch window start. */
  windowStart: number;
  /** The planned dispatch window end. */
  windowEnd: number;
  note: string;
  nextDue?: number;
  /** A confirmation token, if the caller is hitting the write API. */
  confirmationToken?: string;
}

export interface DispatchResult {
  ok: boolean;
  reason?: string;
  dispatchId: string;
  twinId: string;
  windowStart: number;
  windowEnd: number;
  recordedAt: number;
}

const FOUR_HOURS = 4 * 60 * 60_000;

function overlap(a1: number, a2: number, b1: number, b2: number): boolean {
  return a1 < b2 && b1 < a2;
}

function priority(daysUntilDue: number | null, overdue: boolean, opts: { criticalBreach: boolean; criticalDiag: boolean; breaches: number; okDiag: boolean }): { priority: DispatchPriority; reason: string } {
  if (opts.criticalBreach && opts.criticalDiag) return { priority: "CRITICAL", reason: "critical breach + critical diagnostic" };
  if (opts.criticalBreach) return { priority: "HIGH", reason: "critical bound breach" };
  if (overdue && opts.criticalDiag) return { priority: "HIGH", reason: "overdue + critical diagnostic" };
  if (overdue) return { priority: "MEDIUM", reason: "overdue" };
  if (daysUntilDue === null) return { priority: "LOW", reason: "no due date" };
  if (daysUntilDue <= 7) return { priority: "HIGH", reason: `due in ${daysUntilDue}d` };
  if (daysUntilDue <= 30) return { priority: "MEDIUM", reason: `due in ${daysUntilDue}d` };
  return { priority: "LOW", reason: `due in ${daysUntilDue}d` };
}

export async function dispatchList(uid: string): Promise<DispatchList> {
  const twins = await listTwins(uid);
  const cal = await maintenanceCalendar(uid);
  const byPriority: Record<DispatchPriority, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
  const { getHistory } = await import("@/aetheris/core/diagnostics/history");
  const rows: DispatchRow[] = await Promise.all(twins.map(async (twin, i) => {
    const lastDiag = (await getHistory(twin.id, { limit: 1 }))[0] ?? null;
    const lastDiagnostic = lastDiag ? { severity: lastDiag.severity, topFault: lastDiag.topFault } : null;
    const breaches = countBreaches(twin.state, twin.bounds);
    // For each twin, find its earliest upcoming nextDue.
    const calEntries = cal.entries.filter((e) => e.twinId === twin.id);
    const upcoming = calEntries.filter((e) => e.nextDue !== null).sort((a, b) => (a.nextDue ?? 0) - (b.nextDue ?? 0));
    const next = upcoming[0] ?? null;
    const daysUntilDue = next?.daysUntilDue ?? null;
    const overdue = next?.overdue ?? false;
    const p = priority(daysUntilDue, overdue, { criticalBreach: breaches.critical > 0, criticalDiag: lastDiag?.severity === "critical", breaches: breaches.total, okDiag: lastDiag?.severity === "ok" });
    byPriority[p.priority]++;
    return {
      id: `twin:${twin.id}:${i}`,
      twinId: twin.id,
      twinName: twin.name,
      note: next?.note ?? "",
      nextDue: next?.nextDue ?? null,
      daysUntilDue,
      nextDueIn: daysUntilDue === null ? null : daysUntilDue * 86_400_000,
      priority: p.priority,
      reason: p.reason,
      action: actionFor(p.priority),
      maintenanceNote: next?.note || null,
      lastDiagnostic,
      boundBreaches: breaches,
    };
  }));
  const order: Record<DispatchPriority, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  rows.sort((a, b) => order[a.priority] - order[b.priority] || (a.daysUntilDue ?? 1e9) - (b.daysUntilDue ?? 1e9));
  return { uid, total: rows.length, byPriority, rows, generatedAt: Date.now() };
}

function actionFor(p: DispatchPriority): string {
  switch (p) {
    case "CRITICAL": return "DISPATCH immediate inspection and INSPECT gearbox / bearing";
    case "HIGH": return "SCHEDULE inspection within 7 days";
    case "MEDIUM": return "SCHEDULE inspection within 30 days";
    case "LOW": return "MONITOR at next routine window";
  }
}

function countBreaches(state: Record<string, number | string | boolean>, bounds: { key: string; min?: number; max?: number; critical?: boolean }[]): { total: number; critical: number } {
  let total = 0;
  let critical = 0;
  for (const b of bounds) {
    const v = state[b.key];
    if (typeof v !== "number") continue;
    if (b.min !== undefined && v < b.min) { total++; if (b.critical) critical++; }
    if (b.max !== undefined && v > b.max) { total++; if (b.critical) critical++; }
  }
  return { total, critical };
}

export async function dispatchMaintenance(req: DispatchRequest): Promise<DispatchResult> {
  const cap = "maintenance:dispatch";
  const t = await getTwin(req.twinId);
  if (!t || t.uid !== req.uid) {
    record({ type: "permission", uid: req.uid, capability: cap, ok: false, ms: 0, detail: "twin not found or not owned" });
    return { ok: false, reason: "twin not found or not owned", dispatchId: "", twinId: req.twinId, windowStart: req.windowStart, windowEnd: req.windowEnd, recordedAt: Date.now() };
  }
  const now = Date.now();
  if (req.windowStart < now) {
    return { ok: false, reason: "window start is in the past", dispatchId: "", twinId: req.twinId, windowStart: req.windowStart, windowEnd: req.windowEnd, recordedAt: now };
  }
  if (req.windowEnd <= req.windowStart) {
    return { ok: false, reason: "window end must be after window start", dispatchId: "", twinId: req.twinId, windowStart: req.windowStart, windowEnd: req.windowEnd, recordedAt: now };
  }
  if (req.note.trim().length < 3) {
    return { ok: false, reason: "note must be at least 3 characters", dispatchId: "", twinId: req.twinId, windowStart: req.windowStart, windowEnd: req.windowEnd, recordedAt: now };
  }
  if (req.nextDue !== undefined) {
    const max = req.nextDue + 30 * 24 * 60 * 60_000;
    if (req.windowStart > max) {
      return { ok: false, reason: "window start is more than 30 days after nextDue", dispatchId: "", twinId: req.twinId, windowStart: req.windowStart, windowEnd: req.windowEnd, recordedAt: now };
    }
  }
  // Overlap check via the existing calendar + existing dispatches.
  const cal = await maintenanceCalendar(req.uid);
  for (const e of cal.entries) {
    if (e.twinId !== req.twinId) continue;
    if (!e.nextDue) continue;
    const a1 = e.nextDue - FOUR_HOURS;
    const a2 = e.nextDue + FOUR_HOURS;
    if (overlap(req.windowStart, req.windowEnd, a1, a2)) {
      return { ok: false, reason: `overlaps existing maintenance entry due ${new Date(e.nextDue).toISOString()}`, dispatchId: "", twinId: req.twinId, windowStart: req.windowStart, windowEnd: req.windowEnd, recordedAt: now };
    }
  }
  const all = await store.all<{ id: string; uid: string; twinId: string; windowStart: number; windowEnd: number }>(COL);
  for (const [k, v] of Object.entries(all)) {
    if (v.uid !== req.uid || v.twinId !== req.twinId) continue;
    if (overlap(req.windowStart, req.windowEnd, v.windowStart, v.windowEnd)) {
      return { ok: false, reason: `overlaps existing dispatch ${k}`, dispatchId: "", twinId: req.twinId, windowStart: req.windowStart, windowEnd: req.windowEnd, recordedAt: now };
    }
  }
  const id = `${req.twinId}:${req.windowStart}`;
  await store.set(COL, id, { uid: req.uid, twinId: req.twinId, windowStart: req.windowStart, windowEnd: req.windowEnd, note: req.note.slice(0, 200), nextDue: req.nextDue, recordedAt: now });
  // Also append the maintenance entry to the twin (so the calendar reflects it).
  const twin = await getTwin(req.twinId);
  if (twin) {
    twin.maintenance.push({ at: req.windowStart, note: req.note.slice(0, 200), nextDue: req.nextDue });
    twin.events.push({ at: Date.now(), kind: "maintenance-dispatch", detail: `dispatched @ ${new Date(req.windowStart).toISOString()}` });
    await store.set("twins", twin.id, twin);
  }
  record({ type: "tool", uid: req.uid, capability: cap, ok: true, ms: 0, detail: `dispatched ${req.twinId} @ ${new Date(req.windowStart).toISOString()}` });
  return { ok: true, dispatchId: id, twinId: req.twinId, windowStart: req.windowStart, windowEnd: req.windowEnd, recordedAt: now };
}

export async function listDispatches(uid: string): Promise<{ id: string; twinId: string; windowStart: number; windowEnd: number; note: string; nextDue?: number; recordedAt: number }[]> {
  const all = await store.all<{ uid: string; twinId: string; windowStart: number; windowEnd: number; note: string; nextDue?: number; recordedAt: number }>(COL);
  return Object.entries(all).filter(([, v]) => v.uid === uid).map(([id, v]) => ({ id, twinId: v.twinId, windowStart: v.windowStart, windowEnd: v.windowEnd, note: v.note, nextDue: v.nextDue, recordedAt: v.recordedAt }));
}
