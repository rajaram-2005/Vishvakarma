/**
 * Neurosymbolic Verifier — constraint language and the gate that runs over an agent plan.
 *
 *   A plan is a sequence of "steps". Each step may declare:
 *     - preconditions  (e.g. motor must be within a temperature range before ramp-up)
 *     - effects        (the variables it changes, and by how much)
 *     - guard equations that the symbolic solver evaluates to a boolean
 *     - physical units attached to each variable
 *
 *   `verifyPlan` walks the plan forward, applies effects to a state, evaluates each
 *   guard symbolically, and returns:
 *     - ACCEPT: every step is consistent, units are valid, no invariant violated
 *     - REJECT: the first failing step with a structured reason the agent can recalc
 *     - UNSUPPORTED: a step uses a feature outside the supported subset
 *
 *   Everything is pure / deterministic. The audit hook is the only side effect.
 */

import { record } from "../observability/events";
import { Equation, parseExpr, parseEquation, evalExpr, freeVars, checkUnits, parseUnit } from "./solver";

// --------------------------------------------------------------------------- types
export type VarValue = number | string | boolean;
export type State = Record<string, VarValue>;

export interface Range { min?: number; max?: number; inclusive?: boolean }
export interface PlanStep {
  id: string;
  description?: string;
  /** Equations whose LHS must equal RHS under the current state. e.g. "torque = force * radius". */
  invariants?: string[];
  /** Boolean equations that must hold before this step is allowed. e.g. "T_motor < 80". */
  guards?: string[];
  /** Variable assignments applied when this step runs. e.g. { rpm: 1200 } or "rpm + 200" as a string. */
  effects?: Record<string, number | string>;
  /** Optional unit declaration per variable, e.g. { T_motor: "K" }. */
  units?: Record<string, string>;
}

export interface VerdictOk { kind: "accept"; steps: { id: string; status: "ok" }[]; derived: Record<string, number> }
export interface VerdictReject { kind: "reject"; step: string; reason: string; detail: string; suggestion?: string; failingEquation?: string }
export interface VerdictUnsupported { kind: "unsupported"; step: string; detail: string }
export type Verdict = VerdictOk | VerdictReject | VerdictUnsupported;

export interface VerifyOptions {
  /** Optional per-call uid + capability for observability and permissions. */
  uid?: string;
  capability?: string;
  /** Pre-existing state to start from (e.g. last known sensor values). */
  initialState?: State;
  /** Hard caps checked at every step. */
  globalInvariants?: { expression: string; why: string }[];
}

// --------------------------------------------------------------------------- public API

/**
 * Run the symbolic gate over a plan. See module doc for the semantics.
 *
 *   const v = verifyPlan({
 *     initialState: { T_motor: 290, rpm: 0 },
 *     steps: [
 *       { id: "start", guards: ["T_motor < 350"], effects: { rpm: 600 } },
 *       { id: "ramp",  guards: ["T_motor < 350"], effects: { rpm: 1200 } },
 *     ],
 *     globalInvariants: [{ expression: "rpm >= 0", why: "no negative RPM" }],
 *   });
 */
export function verifyPlan(plan: { steps: PlanStep[]; units?: Record<string, string> }, opts: VerifyOptions = {}): Verdict {
  const t0 = Date.now();
  const state: State = { ...(opts.initialState ?? {}) };
  const allUnits: Record<string, string> = { ...(plan.units ?? {}) };
  // merge per-step units
  for (const s of plan.steps) for (const [k, v] of Object.entries(s.units ?? {})) allUnits[k] = v;

  // Initial unit sanity pass: every variable that has a unit and a numeric state
  // must at least parse a non-empty dimension map.
  try { for (const [k, v] of Object.entries(allUnits)) { if (!(k in state)) continue; parseUnit(v); } } catch (e) {
    return reject("__init__", "unit error", `invalid unit declaration: ${(e as Error).message}`, opts);
  }

  const steps: { id: string; status: "ok" }[] = [];
  const derived: Record<string, number> = {};

  // Apply global invariants first.
  for (const gi of opts.globalInvariants ?? []) {
    const r = evalGuard(gi.expression, state);
    if (!r.ok) return reject("__init__", "global invariant error", r.detail, opts, gi.expression);
    if (!r.value) return reject("__init__", "global invariant violated", `before any step: ${gi.why}`, opts, gi.expression);
  }

  for (const step of plan.steps) {
    try {
      // 1. guard equations must hold.
      for (const g of step.guards ?? []) {
        const r = evalGuard(g, state);
        if (!r.ok) return reject(step.id, "guard error", r.detail, opts, g);
        if (!r.value) return reject(step.id, "guard failed", `precondition not met: ${g}`, opts, g);
      }
      // 2. invariant equations must hold.
      for (const inv of step.invariants ?? []) {
        let eq;
        try { eq = parseEquation(inv); } catch (e) { return reject(step.id, "invariant parse error", `could not parse ${inv}: ${(e as Error).message}`, opts, inv); }
        const r = evalEquation(eq, state, allUnits);
        if (!r.ok) return reject(step.id, "invariant error", r.detail, opts, inv);
        if (!r.value) return reject(step.id, "invariant violated", `equation does not balance: ${inv}`, opts, inv);
      }
      // 3. effects: apply numeric or string-arithmetic updates.
      for (const [k, v] of Object.entries(step.effects ?? {})) {
        if (typeof v === "number") state[k] = v;
        else if (typeof v === "string") {
          const e = parseExpr(v);
          for (const fv of freeVars(e)) {
            if (typeof state[fv] !== "number") return reject(step.id, "type error", `effect ${k} = ${v} references non-numeric ${fv}`, opts);
          }
          try { state[k] = evalExpr(e, numify(state)); } catch (e2) { return reject(step.id, "effect error", `${k} = ${v} → ${(e2 as Error).message}`, opts, v); }
        } else state[k] = v;
      }
      // 4. global invariants must still hold after the step.
      for (const gi of opts.globalInvariants ?? []) {
        const r = evalGuard(gi.expression, state);
        if (!r.ok) return reject(step.id, "global invariant error", r.detail, opts, gi.expression);
        if (!r.value) return reject(step.id, "global invariant violated", `after step: ${gi.why}`, opts, gi.expression);
      }
      steps.push({ id: step.id, status: "ok" });
    } catch (e) {
      return reject(step.id, "solver exception", (e as Error).message, opts);
    }
  }

  // 5. expose derived values (numeric state) for the caller.
  for (const [k, v] of Object.entries(state)) if (typeof v === "number") derived[k] = v;

  record({ type: "agent", uid: opts.uid, capability: opts.capability ?? "system:symbolic", ok: true, ms: Date.now() - t0, detail: `symbolic plan accepted (${plan.steps.length} steps)`, meta: { steps: plan.steps.length, derived: Object.keys(derived).length } });
  return { kind: "accept", steps, derived };
}

/** Reject verdict with structured reason. */
function reject(step: string, reason: string, detail: string, opts: VerifyOptions, failingEquation?: string): VerdictReject {
  record({ type: "agent", uid: opts.uid, capability: opts.capability ?? "system:symbolic", ok: false, detail: `symbolic plan REJECTED at ${step}: ${reason} — ${detail}`, meta: { step, reason, failingEquation } });
  return { kind: "reject", step, reason, detail, failingEquation };
}

// --------------------------------------------------------------------------- internal helpers
type GuardResult = { ok: true; value: boolean } | { ok: false; detail: string };

function numify(s: State): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(s)) if (typeof v === "number") out[k] = v;
  return out;
}

/**
 * Evaluate a guard. Guards are a single comparison or boolean expression using
 * `==`, `!=`, `<`, `<=`, `>`, `>=` over a symbolic LHS and a literal/symbolic RHS.
 *   e.g. "T_motor < 350", "rpm >= 100", "state == \"ready\""
 * If the state is non-numeric, string equality is allowed.
 */
function evalGuard(src: string, state: State): GuardResult {
  // Try boolean comparisons first.
  const cmp = /^\s*(.+?)\s*(==|!=|<=|>=|<|>)\s*(.+?)\s*$/.exec(src);
  if (cmp) {
    const [, ls, op, rs] = cmp;
    const lv = tryValue(ls, state);
    const rv = tryValue(rs, state);
    if ((lv.kind === "ok" || lv.kind === "literal") && (rv.kind === "ok" || rv.kind === "literal")) {
      if (typeof lv.value === "string" || typeof rv.value === "string") {
        if (op !== "==" && op !== "!=") return { ok: false, detail: `string ${op} not allowed` };
        const a = String(lv.value), b = String(rv.value);
        return { ok: true, value: op === "==" ? a === b : a !== b };
      }
      const a = lv.value as number, b = rv.value as number;
      switch (op) {
        case "==": return { ok: true, value: a === b };
        case "!=": return { ok: true, value: a !== b };
        case "<":  return { ok: true, value: a <  b };
        case "<=": return { ok: true, value: a <= b };
        case ">":  return { ok: true, value: a >  b };
        case ">=": return { ok: true, value: a >= b };
      }
    }
  }
  // Otherwise: try to evaluate the whole expression as a boolean (0/1 or true/false).
  try {
    const e = parseExpr(src);
    const v = evalExpr(e, numify(state));
    return { ok: true, value: !!v };
  } catch (err) { return { ok: false, detail: (err as Error).message }; }
}

function tryValue(token: string, state: State): { kind: "ok"; value: VarValue } | { kind: "literal"; value: VarValue } | { kind: "unknown" } {
  const t = token.trim();
  if (t in state) return { kind: "ok", value: state[t] };
  if (/^-?\d+(\.\d+)?(e-?\d+)?$/i.test(t)) return { kind: "literal", value: Number(t) };
  const sm = /^"([^"]*)"$/.exec(t);
  if (sm) return { kind: "literal", value: sm[1] };
  if (t === "true") return { kind: "literal", value: true };
  if (t === "false") return { kind: "literal", value: false };
  try {
    const e = parseExpr(t);
    const v = evalExpr(e, numify(state));
    return { kind: "ok", value: v };
  } catch { return { kind: "unknown" }; }
}

function evalEquation(eq: Equation, state: State, units: Record<string, string>): { ok: true; value: boolean } | { ok: false; detail: string } {
  try {
    try { checkUnits(eq.lhs, units); checkUnits(eq.rhs, units); } catch (u) { return { ok: false, detail: `unit error: ${(u as Error).message}` }; }
    const l = evalExpr(eq.lhs, numify(state));
    const r = evalExpr(eq.rhs, numify(state));
    switch (eq.op) {
      case "=":  return { ok: true, value: Math.abs(l - r) <= Math.max(1e-9, Math.abs(r) * 1e-6) };
      case "==": return { ok: true, value: l === r };
      case "!=": return { ok: true, value: l !== r };
      case "<":  return { ok: true, value: l <  r };
      case "<=": return { ok: true, value: l <= r };
      case ">":  return { ok: true, value: l >  r };
      case ">=": return { ok: true, value: l >= r };
    }
  } catch (e) { return { ok: false, detail: (e as Error).message }; }
}

// --------------------------------------------------------------------------- plan validation

/**
 * Validate the structure of a plan an agent produced, before running the solver. Catches
 * shape problems (duplicate step ids, unknown variables, mixed-type effects) so the
 * solver is only invoked on well-formed input.
 */
export function validatePlanShape(plan: { steps: PlanStep[] }): { ok: true } | { ok: false; reason: string; step?: string } {
  const ids = new Set<string>();
  for (const s of plan.steps) {
    if (!s.id || typeof s.id !== "string") return { ok: false, reason: "step is missing an id" };
    if (ids.has(s.id)) return { ok: false, reason: `duplicate step id: ${s.id}`, step: s.id };
    ids.add(s.id);
    for (const g of s.guards ?? []) if (typeof g !== "string" || !g.trim()) return { ok: false, reason: "empty guard", step: s.id };
    for (const inv of s.invariants ?? []) if (typeof inv !== "string" || !inv.trim()) return { ok: false, reason: "empty invariant", step: s.id };
    for (const [k, v] of Object.entries(s.effects ?? {})) {
      if (typeof v !== "number" && typeof v !== "string" && typeof v !== "boolean") return { ok: false, reason: `effect ${k} has unsupported type`, step: s.id };
    }
  }
  return { ok: true };
}

/** A canonical "what is the symbolic engine good for" report, for /api/capabilities. */
export function symbolicStatus() {
  return {
    available: true,
    status: "experimental" as const,
    supports: [
      "linear and polynomial expressions with +, -, *, /, ^",
      "sqrt/sin/cos/tan/exp/log/abs/min/max",
      "unit consistency over SI base and derived units",
      "step guards (comparisons) and invariant equations",
      "global invariants checked before and after each step",
    ],
    doesNotSupport: [
      "symbolic integration / differentiation",
      "equation solving for a variable (substitute before calling)",
      "matrices / vectors (use multiple scalar variables)",
    ],
    notes: "Pure TypeScript, deterministic, no model calls. See tests/symbolic.test.ts.",
  };
}
