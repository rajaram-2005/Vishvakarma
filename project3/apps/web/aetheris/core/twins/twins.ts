/**
 * Digital Twins (Phase 14) — a typed, persisted model of a physical asset that agents reason over
 * BEFORE acting. Twins are fed by device telemetry (auto-sync), carry relationships, events,
 * maintenance, and simple physics/rule models for what-if simulation.
 *
 *   Twin      {id, name, kind, deviceIds[], state, history, relationships, maintenance, events, model}
 *   sync      pull latest telemetry from linked devices into state + history
 *   simulate  apply a proposed actuation to a copy of the state using the twin's model (first-order
 *             rules like `temp += 0.5*valve_pct per minute`), forward N steps, report constraint breaches
 *   health    staleness, out-of-range state vs declared bounds, overdue maintenance
 *
 * Status: IMPLEMENTED (rule-based models; no CAD/FEA). Everything it reports is computed from stored data.
 */
import { randomBytes } from "node:crypto";
import { store } from "@/aetheris/lib/store";
import { getDevice, telemetryFor } from "../physical/devices";
import { record } from "../observability/events";

export interface TwinRule { target: string; expr: string; description?: string }           // expr: JS-safe arithmetic over state vars, evaluated per step
export interface TwinBound { key: string; min?: number; max?: number; unit?: string; critical?: boolean }
export interface Twin {
  id: string; uid: string; name: string; kind: string; deviceIds: string[]; state: Record<string, number | string | boolean>;
  history: { at: number; state: Record<string, number | string | boolean> }[]; bounds: TwinBound[]; rules: TwinRule[]; stepSeconds: number;
  relationships: { kind: "feeds" | "controls" | "part_of" | "near" | "depends_on"; targetId: string }[]; maintenance: { at: number; note: string; nextDue?: number; doneAt?: number; doneNote?: string }[];
  events: { at: number; kind: string; detail: string }[]; createdAt: number; updatedAt: number;
}
const COL = "twins"; const HIST = 300;
export const listTwins = async (uid: string) => Object.values(await store.all<Twin>(COL)).filter((t) => t.uid === uid);
export const getTwin = (id: string) => store.get<Twin>(COL, id);
export async function createTwin(uid: string, input: Partial<Twin> & { name: string }): Promise<Twin> {
  const t: Twin = { id: randomBytes(5).toString("hex"), uid, name: input.name.slice(0, 60), kind: input.kind ?? "asset", deviceIds: input.deviceIds ?? [], state: input.state ?? {}, history: [], bounds: input.bounds ?? [], rules: input.rules ?? [], stepSeconds: input.stepSeconds ?? 60, relationships: input.relationships ?? [], maintenance: input.maintenance ?? [], events: [], createdAt: Date.now(), updatedAt: Date.now() };
  await store.set(COL, t.id, t); return t;
}
export async function saveTwin(t: Twin) { t.updatedAt = Date.now(); t.history = t.history.slice(-HIST); t.events = t.events.slice(-200); await store.set(COL, t.id, t); return t; }
export async function deleteTwin(uid: string, id: string) { const t = await getTwin(id); if (!t || t.uid !== uid) return false; await store.remove(COL, id); return true; }

/** Pull latest device telemetry into twin state. */
export async function syncTwin(t: Twin): Promise<{ updated: string[]; stale: string[] }> {
  const updated: string[] = []; const stale: string[] = [];
  for (const id of t.deviceIds) { const d = await getDevice(id); if (!d || d.uid !== t.uid) continue; const last = (await telemetryFor(id)).at(-1); if (!last || Date.now() - last.at > 10 * 60_000) { stale.push(d.name); continue; } for (const [k, v] of Object.entries(last.values)) { if (k.startsWith("_")) continue; t.state[k] = v; updated.push(k); } }
  if (updated.length) t.history.push({ at: Date.now(), state: { ...t.state } });
  const breaches = checkBounds(t.state, t.bounds); for (const b of breaches) t.events.push({ at: Date.now(), kind: b.critical ? "critical" : "warning", detail: b.detail });
  await saveTwin(t); return { updated, stale };
}
/** Pure: bound checks (tested). */
export function checkBounds(state: Record<string, unknown>, bounds: TwinBound[]) {
  const out: { key: string; value: number; detail: string; critical: boolean }[] = [];
  for (const b of bounds) { const v = Number(state[b.key]); if (!Number.isFinite(v)) continue; if (b.min !== undefined && v < b.min) out.push({ key: b.key, value: v, critical: !!b.critical, detail: `${b.key}=${v}${b.unit ?? ""} below min ${b.min}` }); if (b.max !== undefined && v > b.max) out.push({ key: b.key, value: v, critical: !!b.critical, detail: `${b.key}=${v}${b.unit ?? ""} above max ${b.max}` }); }
  return out;
}
/** Safe arithmetic evaluator: numbers, identifiers, + - * / % ( ) and min/max/abs/clamp. No JS eval. */
export function evalExpr(expr: string, vars: Record<string, number>): number {
  const toks = expr.match(/\d+(?:\.\d+)?|[A-Za-z_]\w*|[-+*/%(),]/g) ?? []; let i = 0;
  const peek = () => toks[i], next = () => toks[i++];
  const prim = (): number => { const t = next(); if (t === undefined) throw new Error("unexpected end"); if (t === "(") { const v = expr_(); if (next() !== ")") throw new Error("expected )"); return v; } if (t === "-") return -prim(); if (/^\d/.test(t)) return Number(t); if (/^[A-Za-z_]/.test(t)) { if (peek() === "(") { next(); const args: number[] = []; if (peek() !== ")") { args.push(expr_()); while (peek() === ",") { next(); args.push(expr_()); } } if (next() !== ")") throw new Error("expected )"); switch (t) { case "min": return Math.min(...args); case "max": return Math.max(...args); case "abs": return Math.abs(args[0]); case "clamp": return Math.max(args[1], Math.min(args[2], args[0])); case "sqrt": return Math.sqrt(args[0]); default: throw new Error(`unknown fn ${t}`); } } const v = vars[t]; if (v === undefined || !Number.isFinite(v)) throw new Error(`unknown var ${t}`); return v; } throw new Error(`unexpected ${t}`); };
  const term = (): number => { let v = prim(); while (peek() === "*" || peek() === "/" || peek() === "%") { const op = next(); const r = prim(); v = op === "*" ? v * r : op === "/" ? (r === 0 ? 0 : v / r) : v % r; } return v; };
  const expr_ = (): number => { let v = term(); while (peek() === "+" || peek() === "-") { const op = next(); const r = term(); v = op === "+" ? v + r : v - r; } return v; };
  const v = expr_(); if (i < toks.length) throw new Error(`trailing ${toks[i]}`); return v;
}
/** Pure: forward-simulate a proposed change over N steps with the twin's rules; report breaches (tested). */
export function simulate(t: Pick<Twin, "state" | "rules" | "bounds" | "stepSeconds">, proposed: Record<string, number>, steps = 10) {
  const vars: Record<string, number> = {}; for (const [k, v] of Object.entries(t.state)) if (typeof v === "number") vars[k] = v; else if (typeof v === "boolean") vars[k] = v ? 1 : 0;
  Object.assign(vars, proposed); vars.dt = t.stepSeconds; const trajectory: Record<string, number>[] = [{ ...vars }]; const breaches: { step: number; detail: string; critical: boolean }[] = []; const errors: string[] = [];
  for (let s = 1; s <= steps; s++) { const nextV = { ...vars }; for (const r of t.rules) { try { nextV[r.target] = evalExpr(r.expr, vars); } catch (e) { errors.push(`${r.target}: ${(e as Error).message}`); } } Object.assign(vars, nextV); trajectory.push({ ...vars }); for (const b of checkBounds(vars, t.bounds)) breaches.push({ step: s, detail: b.detail, critical: b.critical }); if (breaches.some((b) => b.critical)) break; }
  const first = breaches[0];
  return { safe: !breaches.some((b) => b.critical), breaches: breaches.slice(0, 20), firstBreachAtSeconds: first ? first.step * t.stepSeconds : undefined, final: trajectory.at(-1)!, trajectory: trajectory.filter((_, i) => i % Math.max(1, Math.floor(steps / 10)) === 0 || i === trajectory.length - 1), errors: [...new Set(errors)] };
}
export function twinHealth(t: Twin) {
  const lastAt = t.history.at(-1)?.at; const stale = !lastAt || Date.now() - lastAt > 15 * 60_000; const breaches = checkBounds(t.state, t.bounds); const overdue = t.maintenance.filter((m) => !m.doneAt && m.nextDue && m.nextDue < Date.now());
  const score = Math.max(0, 100 - (stale ? 30 : 0) - breaches.reduce((n, b) => n + (b.critical ? 40 : 15), 0) - overdue.length * 10);
  return { score, stale, lastAt, breaches, overdueMaintenance: overdue, criticalEvents24h: t.events.filter((e) => e.kind === "critical" && Date.now() - e.at < 86_400_000).length };
}
export async function syncAllTwins() { const all = Object.values(await store.all<Twin>(COL)).filter((t) => t.deviceIds.length); for (const t of all) { try { await syncTwin(t); } catch (e) { record({ type: "device", uid: t.uid, capability: `twin:${t.id}.sync`, ok: false, detail: (e as Error).message }); } } return all.length; }
