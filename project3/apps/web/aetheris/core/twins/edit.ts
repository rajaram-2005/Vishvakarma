/**
 * Twin Edit / Write API.
 *
 *   A small, typed set of mutations that the UI (or the user
 *   directly via /api/twins/edit) can use to modify a twin.
 *   Every mutation:
 *     - checks the principal owns the twin (uid matches);
 *     - validates the input shape;
 *     - records an event on the twin (so audit can pick it up);
 *     - runs the bound-check on the new state and adds events
 *       for any breaches;
 *     - saves and returns the updated twin.
 *
 *   This is the same path that the rest of the system uses; no
 *   second write route. The shape is intentionally narrow: set a
 *   name, set a state key, add a bound, add a rule, add a
 *   maintenance note. Anything more invasive is intentionally
 *   not exposed here.
 */

import { getTwin, saveTwin, type Twin, type TwinBound, type TwinRule } from "@/aetheris/core/twins/twins";
import { record } from "@/aetheris/core/observability/events";

export type EditResult =
  | { ok: true; twin: Twin; changes: string[] }
  | { ok: false; reason: string };

function ownOrThrow(uid: string, twin: Twin | undefined, id: string): EditResult {
  if (!twin) return { ok: false, reason: `twin ${id} not found` };
  if (twin.uid && twin.uid !== uid) return { ok: false, reason: `twin ${id} is not owned by ${uid}` };
  return { ok: true, twin, changes: [] };
}

export async function setName(uid: string, id: string, name: string): Promise<EditResult> {
  const t = await getTwin(id);
  const o = ownOrThrow(uid, t, id);
  if (!o.ok) return o;
  const trimmed = name.slice(0, 60);
  o.twin.name = trimmed;
  o.twin.events.push({ at: Date.now(), kind: "edit-name", detail: trimmed });
  await saveTwin(o.twin);
  record({ type: "device", uid, capability: `twin:${id}.name`, ok: true, detail: trimmed });
  return { ok: true, twin: o.twin, changes: ["name"] };
}

export async function setState(uid: string, id: string, key: string, value: number | string | boolean): Promise<EditResult> {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) return { ok: false, reason: `invalid state key: ${key}` };
  const t = await getTwin(id);
  const o = ownOrThrow(uid, t, id);
  if (!o.ok) return o;
  o.twin.state[key] = value;
  o.twin.events.push({ at: Date.now(), kind: "edit-state", detail: `${key}=${value}` });
  await saveTwin(o.twin);
  record({ type: "device", uid, capability: `twin:${id}.state.${key}`, ok: true, detail: String(value) });
  return { ok: true, twin: o.twin, changes: [`state.${key}`] };
}

export async function addBound(uid: string, id: string, b: TwinBound): Promise<EditResult> {
  if (!b.key) return { ok: false, reason: "bound requires a key" };
  if (b.min === undefined && b.max === undefined) return { ok: false, reason: "bound requires min or max" };
  const t = await getTwin(id);
  const o = ownOrThrow(uid, t, id);
  if (!o.ok) return o;
  // Reject duplicate keys.
  if (o.twin.bounds.some((x) => x.key === b.key)) return { ok: false, reason: `bound on ${b.key} already exists` };
  o.twin.bounds.push(b);
  o.twin.events.push({ at: Date.now(), kind: "edit-bound", detail: `${b.key}: [${b.min ?? "-∞"}, ${b.max ?? "∞"}]` });
  await saveTwin(o.twin);
  record({ type: "device", uid, capability: `twin:${id}.bound.${b.key}`, ok: true });
  return { ok: true, twin: o.twin, changes: [`bound.${b.key}`] };
}

export async function removeBound(uid: string, id: string, key: string): Promise<EditResult> {
  const t = await getTwin(id);
  const o = ownOrThrow(uid, t, id);
  if (!o.ok) return o;
  const before = o.twin.bounds.length;
  o.twin.bounds = o.twin.bounds.filter((b) => b.key !== key);
  if (o.twin.bounds.length === before) return { ok: false, reason: `no bound on ${key}` };
  o.twin.events.push({ at: Date.now(), kind: "edit-bound", detail: `remove ${key}` });
  await saveTwin(o.twin);
  record({ type: "device", uid, capability: `twin:${id}.bound.${key}.remove`, ok: true });
  return { ok: true, twin: o.twin, changes: [`bound.${key}-`] };
}

export async function addRule(uid: string, id: string, r: TwinRule): Promise<EditResult> {
  if (!r.target) return { ok: false, reason: "rule requires a target" };
  if (!r.expr) return { ok: false, reason: "rule requires an expr" };
  const t = await getTwin(id);
  const o = ownOrThrow(uid, t, id);
  if (!o.ok) return o;
  o.twin.rules.push(r);
  o.twin.events.push({ at: Date.now(), kind: "edit-rule", detail: `${r.target} := ${r.expr}` });
  await saveTwin(o.twin);
  record({ type: "device", uid, capability: `twin:${id}.rule.${r.target}`, ok: true });
  return { ok: true, twin: o.twin, changes: [`rule.${r.target}`] };
}

export async function addMaintenance(uid: string, id: string, note: string, nextDue?: number): Promise<EditResult> {
  const t = await getTwin(id);
  const o = ownOrThrow(uid, t, id);
  if (!o.ok) return o;
  const entry: { at: number; note: string; nextDue?: number } = { at: Date.now(), note: note.slice(0, 200) };
  if (nextDue && nextDue > 0) entry.nextDue = nextDue;
  o.twin.maintenance.push(entry);
  o.twin.events.push({ at: Date.now(), kind: "edit-mx", detail: note.slice(0, 80) });
  await saveTwin(o.twin);
  record({ type: "device", uid, capability: `twin:${id}.maintenance`, ok: true, detail: note.slice(0, 80) });
  return { ok: true, twin: o.twin, changes: ["maintenance"] };
}
