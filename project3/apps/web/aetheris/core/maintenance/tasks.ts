/**
 * Maintenance tasks.
 *
 *   A read-side view of every maintenance entry across the
 *   user's fleet, partitioned into "open" and "done" by the
 *   `doneAt` field that the close API stamps. The composer
 *   does not invent tasks: it reads what the user has
 *   declared on each twin (via the existing maintenance
 *   op) and what `closeMaintenance` has stamped. The page
 *   is the operator's to-do view of the same data that
 *   drives the dispatch list and the maintenance calendar.
 *
 *   This module is intentionally narrow. The data lives on
 *   the twin (production). The composer is a read view. The
 *   write path is `closeMaintenance` in `src/core/twins/twins.ts`
 *   (added in this slice), capability-gated at `safe_write`.
 */
import { listTwins, type Twin } from "@/aetheris/core/twins/twins";

export interface TaskRow {
  /** Stable composite key for the row: twinId + entry `at`. */
  id: string;
  twinId: string;
  twinName: string;
  /** The note the user entered for this entry. */
  note: string;
  /** When the entry was logged. */
  at: number;
  /** When the entry is due (if set). */
  nextDue: number | null;
  daysUntilDue: number | null;
  overdue: boolean;
  /** When the entry was marked done (if set). */
  doneAt: number | null;
  doneNote: string | null;
  /** Age in days since done. */
  daysOld: number;
}

export interface TaskList {
  uid: string;
  total: number;
  open: TaskRow[];
  done: TaskRow[];
  generatedAt: number;
}

function makeRow(twin: Twin, m: Twin["maintenance"][number], now: number): TaskRow {
  const daysUntilDue = m.nextDue ? Math.round((m.nextDue - now) / 86_400_000) : null;
  const age = Math.round((now - m.at) / 86_400_000);
  return {
    id: `${twin.id}:${m.at}`,
    twinId: twin.id,
    twinName: twin.name,
    note: m.note,
    at: m.at,
    nextDue: m.nextDue ?? null,
    daysUntilDue,
    overdue: daysUntilDue !== null && daysUntilDue < 0,
    doneAt: m.doneAt ?? null,
    doneNote: m.doneNote ?? null,
    daysOld: age,
  };
}

export async function taskList(uid: string): Promise<TaskList> {
  const twins = await listTwins(uid);
  const now = Date.now();
  const open: TaskRow[] = [];
  const done: TaskRow[] = [];
  for (const t of twins) {
    for (const m of t.maintenance) {
      const row = makeRow(t, m, now);
      if (row.doneAt !== null) done.push(row);
      else open.push(row);
    }
  }
  // Newest first on each side. For "open", overdue and the
  // earliest nextDue float to the top. For "done", the most
  // recently closed floats to the top.
  open.sort((a, b) => {
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
    const aDue = a.nextDue ?? Number.MAX_SAFE_INTEGER;
    const bDue = b.nextDue ?? Number.MAX_SAFE_INTEGER;
    if (aDue !== bDue) return aDue - bDue;
    return a.at - b.at;
  });
  done.sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0));
  return { uid, total: open.length + done.length, open, done, generatedAt: now };
}

/**
 * Mark a maintenance entry as done.
 *
 *   - The twin must exist and be owned by the user.
 *   - The entry is identified by its `at` timestamp; there
 *     must be exactly one open match.
 *   - The write stamps `doneAt = now` and an optional
 *     `doneNote` (the operator's reason for closing).
 *   - It records an observability event of type "tool"
 *     with capability "maintenance:close".
 *
 *   Returns `{ ok: false, reason }` on any rule violation.
 *   The API route is responsible for capability gating and
 *   audit. The function is honest: it does not silently
 *   re-open a closed entry.
 */
import { getTwin, saveTwin } from "@/aetheris/core/twins/twins";
import { record } from "@/aetheris/core/observability/events";

const CLOSE_CAP = "maintenance:close";

export interface CloseRequest {
  uid: string;
  twinId: string;
  /** The `at` timestamp of the entry to close. */
  at: number;
  /** Optional operator note explaining the close. */
  doneNote?: string;
}

export interface CloseResult {
  ok: boolean;
  reason?: string;
  twinId: string;
  at: number;
  doneAt: number | null;
  doneNote: string | null;
  recordedAt: number;
}

export async function closeMaintenance(req: CloseRequest): Promise<CloseResult> {
  const t = await getTwin(req.twinId);
  if (!t || t.uid !== req.uid) {
    record({ type: "permission", uid: req.uid, capability: CLOSE_CAP, ok: false, ms: 0, detail: "twin not found or not owned" });
    return { ok: false, reason: "twin not found or not owned", twinId: req.twinId, at: req.at, doneAt: null, doneNote: null, recordedAt: Date.now() };
  }
  const idx = t.maintenance.findIndex((m) => m.at === req.at);
  if (idx < 0) {
    record({ type: "permission", uid: req.uid, capability: CLOSE_CAP, ok: false, ms: 0, detail: `no maintenance entry at ${req.at} on ${t.id}` });
    return { ok: false, reason: "no maintenance entry with that timestamp", twinId: req.twinId, at: req.at, doneAt: null, doneNote: null, recordedAt: Date.now() };
  }
  const m = t.maintenance[idx]!;
  if (m.doneAt) {
    record({ type: "permission", uid: req.uid, capability: CLOSE_CAP, ok: false, ms: 0, detail: `entry at ${req.at} on ${t.id} already closed` });
    return { ok: false, reason: "entry is already closed", twinId: req.twinId, at: req.at, doneAt: m.doneAt, doneNote: m.doneNote ?? null, recordedAt: Date.now() };
  }
  const doneNote = (req.doneNote ?? "").trim().slice(0, 300) || null;
  const doneAt = Date.now();
  t.maintenance[idx] = { ...m, doneAt, doneNote: doneNote ?? undefined };
  t.events.push({ at: doneAt, kind: "maintenance-close", detail: `closed @ ${new Date(doneAt).toISOString()}${doneNote ? ` (${doneNote})` : ""}` });
  await saveTwin(t);
  record({ type: "tool", uid: req.uid, capability: CLOSE_CAP, ok: true, ms: 0, detail: `closed ${req.twinId} entry @ ${new Date(req.at).toISOString()}` });
  return { ok: true, twinId: req.twinId, at: req.at, doneAt, doneNote, recordedAt: doneAt };
}
