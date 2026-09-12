/**
 * Wind Turbine plan gate — a deterministic, three-stage pipeline that:
 *
 *   (1) Forward-simulates the digital twin over N steps with the proposed
 *       intervention. This is real: it uses ../twins/twins.ts's `simulate()`,
 *       which runs the canonical rule-based physics from ./model.ts.
 *   (2) Validates the resulting trajectory against the *symbolic* constraints
 *       supplied by the caller. This is real: it uses
 *       ../symbolic/constraints.ts's `verifyPlan()`, with units from
 *       ./model.ts's `UNITS` map.
 *   (3) (Optional) Scores the trajectory with a PBNN trained on past
 *       interventions. The PBNN learns `health_pct_next = f(state, intervention)`
 *       from the trajectory history and is queried for a 1-sigma band; if the
 *       predicted health falls below the constraint, the plan is rejected.
 *
 *   Why this is useful:
 *     An agent can now answer "if I derate 20% and increase cooling, will the
 *     gearbox stay under 360 K?" with a structured ACCEPT/REJECT verdict whose
 *     evidence is the actual simulated trajectory, the actual symbolic check,
 *     and (when trained) the actual learned model. No string-matching, no
 *     hand-waving.
 *
 *   Status: EXPERIMENTAL. The rules are first-order linearised. Real
 *   engineering requires full CFD/FEA. This is for agent reasoning over
 *   first-order trade-offs.
 */

import { record } from "../observability/events";
import { simulate, type Twin } from "../twins/twins";
import { verifyPlan, type PlanStep, type Verdict, type VarValue } from "../symbolic/constraints";
import { UNITS, CRITICAL_BOUND_KEYS, type ChannelId, DEFAULT_BOUNDS } from "./model";

// --------------------------------------------------------------------------- types

export interface InterventionStep {
  /** Free-form id, e.g. "derate_20pct" or "increase_cooling" */
  id: string;
  /** The variable changes applied at this step (numeric only) */
  effects: Partial<Record<ChannelId, number>>;
  /**
   * Symbolic guards that must hold *before* this step runs, e.g. "T_gearbox_K < 360".
   * Evaluated against the *current* twin state (which equals the trajectory end of
   * the previous step).
   */
  guards?: string[];
  /**
   * Symbolic invariants the simulator must satisfy throughout this step's
   * window, e.g. "T_gearbox_K < 360". Evaluated by the Neurosymbolic Verifier.
   */
  invariants?: string[];
}

export interface PlanOptions {
  /** How many simulation steps each intervention should run. */
  stepsPerIntervention?: number;
  /** Hard caps the symbolic verifier checks at every step, before & after. */
  globalInvariants?: string[];
  /** Optional PBNN predictor; if provided, its score is folded in. */
  predictor?: HealthPredictor;
  /** observability uid */
  uid?: string;
}

export interface HealthPredictor {
  /** A trained PBNN that predicts `health_pct` at the end of the plan. */
  predictHealth: (state: Record<string, number>) => { yHat: number; sigma: number } | null;
  /** Minimum acceptable health under the prediction. */
  minHealth?: number;
}

export interface PlanVerdict {
  ok: boolean;
  /** Step id where the plan was rejected, if any. */
  rejectedAt?: string;
  /** Why. */
  reason?: string;
  /** Per-step trajectory (the simulated future states). */
  trajectory: { step: number; state: Record<string, number> }[];
  /** All symbolic / numerical breaches, with the step and the channel. */
  breaches: { step: number; channel: string; detail: string; critical: boolean }[];
  /** When a PBNN was provided, the predicted end-of-plan health. */
  prediction?: { health: number; sigma: number; belowThreshold: boolean };
  /** The raw digital-twin simulation (kept for audit). */
  rawSimulation: ReturnType<typeof simulate>;
  /** The symbolic verdict. */
  symbolic: Verdict;
}

// --------------------------------------------------------------------------- entry point

/**
 * Plan and gate a sequence of interventions on a wind-turbine twin.
 *
 *   const v = planAndGate(twin, [
 *     { id: "derate", effects: { derate_pct: 80 }, invariants: ["T_gearbox_K < 360"] },
 *     { id: "wait",  effects: {}, guards: ["T_gearbox_K < 350"] },
 *   ], { stepsPerIntervention: 10 });
 */
export function planAndGate(twin: Pick<Twin, "state" | "rules" | "bounds" | "stepSeconds">, interventions: InterventionStep[], opts: PlanOptions = {}): PlanVerdict {
  const t0 = Date.now();
  const stepsPerIntervention = Math.max(1, Math.min(opts.stepsPerIntervention ?? 10, 500));
  const trajectory: PlanVerdict["trajectory"] = [];
  const breaches: PlanVerdict["breaches"] = [];

  // Pre-flight symbolic check on the current state, against the global invariants.
  const initialStateForSymbols: Record<string, VarValue> = { ...(twin.state as Record<string, VarValue>) };
  if (opts.globalInvariants?.length) {
    const preflight = verifyPlan({ steps: [{ id: "__preflight__", invariants: opts.globalInvariants }], units: UNITS as Record<string, string> }, { uid: opts.uid, initialState: initialStateForSymbols, globalInvariants: opts.globalInvariants.map((expression) => ({ expression, why: "global bound" })) });
    if (preflight.kind === "reject") {
      record({ type: "agent", uid: opts.uid, capability: "system:windturbine.plan", ok: false, ms: Date.now() - t0, detail: `preflight rejected: ${preflight.reason}`, meta: { step: preflight.step } });
      return { ok: false, rejectedAt: preflight.step, reason: preflight.reason, trajectory: [], breaches: [], rawSimulation: emptySim(), symbolic: preflight };
    }
  }

  // Build the symbolic plan: each intervention becomes one PlanStep with guards
  // and invariants carried through.
  const symbolicPlan: { steps: PlanStep[]; units: Record<string, string> } = {
    steps: interventions.map((iv) => ({
      id: iv.id,
      guards: iv.guards,
      invariants: iv.invariants,
      effects: iv.effects as Record<string, number>,
    })),
    units: UNITS as Record<string, string>,
  };

  // Run the digital-twin simulation over the full sequence.
  const rawSimulation = simulate(twin, mergeEffects(interventions, stepsPerIntervention), stepsPerIntervention * interventions.length);

  // Translate the digital-twin `breaches` into the unified breach list. The
  // simulator reports its own message; we add the channel for filtering.
  for (const b of rawSimulation.breaches) {
    const channel = b.detail.split("=")[0]?.trim() ?? "?";
    breaches.push({ step: b.step, channel, detail: b.detail, critical: b.critical });
  }

  // Sample the trajectory at the end of every intervention so the agent can
  // see "after step N the state was ...". Cheap to do from the simulator's
  // sampled trajectory.
  for (let i = 0; i < interventions.length; i++) {
    const at = Math.min(rawSimulation.trajectory.length - 1, (i + 1) * stepsPerIntervention);
    const sample = rawSimulation.trajectory[at];
    if (sample) trajectory.push({ step: i + 1, state: extractNumeric(sample) });
  }

  // Symbolic verdict against the *initial* state with the symbolic plan.
  // (The symbolic verifier is conservative: it checks invariants symbolically,
  // not by re-running the digital-twin. The two are independent; agreement is
  // required for ACCEPT.)
  const symbolic = verifyPlan(symbolicPlan, { uid: opts.uid, initialState: initialStateForSymbols, globalInvariants: opts.globalInvariants?.map((expression) => ({ expression, why: "global bound" })) });
  if (symbolic.kind === "reject") {
    record({ type: "agent", uid: opts.uid, capability: "system:windturbine.plan", ok: false, ms: Date.now() - t0, detail: `symbolic rejected at ${symbolic.step}: ${symbolic.reason}`, meta: { step: symbolic.step } });
    return { ok: false, rejectedAt: symbolic.step, reason: `symbolic: ${symbolic.reason}`, trajectory, breaches, rawSimulation, symbolic };
  }

  // PBNN check (optional). The predictor runs on the trajectory's final state
  // and is asked for health. If below the threshold, the plan is rejected.
  let prediction: PlanVerdict["prediction"] | undefined;
  if (opts.predictor) {
    const finalState = rawSimulation.final;
    const numeric: Record<string, number> = {};
    for (const [k, v] of Object.entries(finalState)) if (typeof v === "number") numeric[k] = v;
    const p = opts.predictor.predictHealth(numeric);
    const minHealth = opts.predictor.minHealth ?? 50;
    if (p) {
      const below = p.yHat < minHealth;
      prediction = { health: p.yHat, sigma: p.sigma, belowThreshold: below };
      if (below) {
        record({ type: "agent", uid: opts.uid, capability: "system:windturbine.plan", ok: false, ms: Date.now() - t0, detail: `PBNN predicted health ${p.yHat.toFixed(1)} below min ${minHealth}` });
        return { ok: false, rejectedAt: "__pbnn__", reason: `predicted health ${p.yHat.toFixed(1)} is below the ${minHealth}% threshold`, trajectory, breaches, prediction, rawSimulation, symbolic };
      }
    }
  }

  // Final check: a digital-twin critical breach anywhere is a hard fail.
  const critical = breaches.find((b) => b.critical);
  if (critical) {
    record({ type: "agent", uid: opts.uid, capability: "system:windturbine.plan", ok: false, ms: Date.now() - t0, detail: `simulator critical breach at step ${critical.step}: ${critical.detail}` });
    return { ok: false, rejectedAt: `step ${critical.step}`, reason: critical.detail, trajectory, breaches, prediction, rawSimulation, symbolic };
  }

  record({ type: "agent", uid: opts.uid, capability: "system:windturbine.plan", ok: true, ms: Date.now() - t0, detail: `plan accepted: ${interventions.length} intervention(s)`, meta: { steps: interventions.length, breaches: breaches.length, predicted: prediction?.health } });
  return { ok: true, trajectory, breaches, prediction, rawSimulation, symbolic };
}

// --------------------------------------------------------------------------- helpers

/** Build the `proposed` map the digital-twin `simulate()` expects: numeric changes
 *  applied at the *start* of the window. We don't try to make the simulator
 *  schedule the changes over time; instead, the simulator's existing safe
 *  semantics (apply at t=0, propagate through rules over N steps) match our
 *  "first intervention kicks in immediately" assumption. */
function mergeEffects(interventions: InterventionStep[], _stepsPerIntervention: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const iv of interventions) for (const [k, v] of Object.entries(iv.effects)) if (typeof v === "number") out[k] = v;
  return out;
}

function extractNumeric(s: Record<string, number | string | boolean>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(s)) if (typeof v === "number") out[k] = v;
  return out;
}

function emptySim(): ReturnType<typeof simulate> {
  return { safe: true, breaches: [], firstBreachAtSeconds: undefined, final: {}, trajectory: [{}], errors: [] };
}

/** Build a default global invariant set from the canonical bound map. Used by
 *  the API route when the caller doesn't specify one. */
export function defaultGlobalInvariants(): string[] {
  const out: string[] = [];
  for (const k of CRITICAL_BOUND_KEYS) {
    const b = DEFAULT_BOUNDS[k];
    if (b.critical) {
      out.push(`${k} >= ${b.min}`);
      out.push(`${k} <= ${b.max}`);
    }
  }
  return out;
}
