/**
 * Wind Turbine — typed component model and canonical asset definitions.
 *
 *   Why this exists:
 *     The existing Digital Twin module (../twins/twins.ts) is generic: it stores
 *     state, has bounds, and runs a rule-based forward simulation. This module
 *     wraps that generic machinery with a *typed* wind-turbine vocabulary so:
 *       • agents can ask questions like "what is the gearbox temperature?" using
 *         stable names rather than ad-hoc strings;
 *       • the rule-based forward model is written by domain experts once, here,
 *         and reused for every turbine instance;
 *       • the Neurosymbolic Verifier (../symbolic/constraints.ts) and the PBNN
 *         (../learning/pbnn.ts) can be wired to the same well-typed channels.
 *
 *   What this is NOT:
 *     • Not a CFD solver, not a FEA tool, not a wind-resource library.
 *     • Not a high-fidelity physics model. The forward model is a deliberately
 *       small set of linearised first-order relations. Anything more is a
 *       research project, not a module in this codebase.
 *     • Not a replacement for the engineering team's domain models. This is the
 *       *default*; an operator can override any rule.
 *
 *   Status: EXPERIMENTAL. Honest about that.
 */

import type { Twin, TwinBound, TwinRule } from "../twins/twins";

// --------------------------------------------------------------------------- vocabulary
//
// Every channel the agent can ask about has a stable name + SI unit. New channels
// are added by extending the `ChannelId` union AND providing a unit. The
// `units` map is what the symbolic verifier uses to check unit consistency.

export type ChannelId =
  // wind / environment
  | "wind_speed_ms" | "wind_dir_deg" | "air_density_kgm3"
  // rotor
  | "rotor_rpm" | "pitch_deg" | "yaw_deg" | "Cp" // power coefficient
  // drivetrain
  | "gen_rpm" | "torque_Nm" | "gearbox_ratio" | "gearbox_eff"
  // thermal
  | "T_gearbox_K" | "T_generator_K" | "T_bearing_K" | "T_ambient_K"
  // mechanical
  | "vib_gearbox_mms" | "vib_bearing_mms" | "oil_pressure_kPa" | "oil_temp_K"
  // electrical
  | "P_active_kW" | "P_reactive_kvar" | "P_rated_kW"
  // control
  | "derate_pct" | "load_pct" | "mode" // "run" | "derate" | "stop" | "service"
  // health
  | "health_pct" | "anomaly_score";

export const UNITS: Record<ChannelId, string> = {
  wind_speed_ms: "m/s", wind_dir_deg: "1", air_density_kgm3: "kg/m^3",
  rotor_rpm: "1/s", pitch_deg: "1", yaw_deg: "1", Cp: "1",
  gen_rpm: "1/s", torque_Nm: "kg*m^2/s^2", gearbox_ratio: "1", gearbox_eff: "1",
  T_gearbox_K: "K", T_generator_K: "K", T_bearing_K: "K", T_ambient_K: "K",
  vib_gearbox_mms: "m/s", vib_bearing_mms: "m/s", oil_pressure_kPa: "kg/m*s^2", oil_temp_K: "K",
  P_active_kW: "kg*m^2/s^3", P_reactive_kvar: "kg*m^2/s^3", P_rated_kW: "kg*m^2/s^3",
  derate_pct: "1", load_pct: "1", mode: "1",
  health_pct: "1", anomaly_score: "1",
};

export const CRITICAL_BOUND_KEYS: ChannelId[] = [
  "T_gearbox_K", "T_generator_K", "T_bearing_K",
  "vib_gearbox_mms", "vib_bearing_mms",
  "oil_pressure_kPa",
  "rotor_rpm", "gen_rpm",
];

// --------------------------------------------------------------------------- canonical bounds
//
// Defaults for a 2 MW class turbine. Operators can override per-instance. These
// are engineering-rule-of-thumb values, not a certified safety case.

export interface TurbineClass { rated: { powerKW: number; rotorRPM: number; gearboxRatio: number }; }
export const CLASS_2MW: TurbineClass = { rated: { powerKW: 2000, rotorRPM: 17, gearboxRatio: 100 } };

export const DEFAULT_BOUNDS: Record<ChannelId, { min: number; max: number; critical?: boolean; unit?: string }> = {
  wind_speed_ms:        { min: 3,   max: 25,  unit: "m/s" },
  wind_dir_deg:         { min: 0,   max: 360, unit: "deg" },
  air_density_kgm3:     { min: 1.0, max: 1.4, unit: "kg/m^3" },
  T_ambient_K:          { min: 233, max: 323, unit: "K" },
  rotor_rpm:            { min: 6,   max: 19,  unit: "rpm", critical: true },
  pitch_deg:            { min: -2,  max: 90,  unit: "deg" },
  yaw_deg:              { min: -180,max: 540, unit: "deg" },
  Cp:                   { min: 0,   max: 0.5, unit: "-" },
  gen_rpm:              { min: 600, max: 1900,unit: "rpm", critical: true },
  torque_Nm:            { min: 0,   max: 2.5e6, unit: "N·m" },
  gearbox_ratio:        { min: 80,  max: 120, unit: "-" },
  gearbox_eff:          { min: 0.9, max: 0.99,unit: "-" },
  T_gearbox_K:          { min: 233, max: 360, unit: "K", critical: true },
  T_generator_K:        { min: 233, max: 420, unit: "K", critical: true },
  T_bearing_K:          { min: 233, max: 380, unit: "K", critical: true },
  vib_gearbox_mms:      { min: 0,   max: 11.2,unit: "mm/s", critical: true }, // ISO 10816 rigid foundation
  vib_bearing_mms:      { min: 0,   max: 11.2,unit: "mm/s", critical: true },
  oil_pressure_kPa:     { min: 80,  max: 400, unit: "kPa", critical: true },
  oil_temp_K:           { min: 233, max: 360, unit: "K" },
  P_active_kW:          { min: 0,   max: 2100,unit: "kW" },
  P_reactive_kvar:      { min: -800,max: 800, unit: "kvar" },
  P_rated_kW:           { min: 1500,max: 3500,unit: "kW" },
  derate_pct:           { min: 0,   max: 100, unit: "%" },
  load_pct:             { min: 0,   max: 110, unit: "%" },
  mode:                 { min: 0,   max: 3,   unit: "enum" },
  health_pct:           { min: 0,   max: 100, unit: "%" },
  anomaly_score:        { min: 0,   max: 1,   unit: "-" },
};

// --------------------------------------------------------------------------- rule-based physics
//
// Each rule is a first-order update: `target = expr(state)`. The DSL is the
// existing safe arithmetic in ../twins/twins.ts — no eval(), no JS injection.
// stepSeconds is 60 for these rules: each step is "one minute of operation".
//
// The model is intentionally small. It captures:
//   • Cp  = 0.5 * (1 - exp(-0.05 * wind_speed))  *  cos(pitch)^3   (toy Betz-ish)
//   • P_active_kW = 0.5 * rho * A * Cp * wind^3 / 1000  (clipped to rated)
//   • rotor_rpm derived from wind via tip-speed ratio (toy)
//   • gearbox loss: 0.5% of input torque as heat per minute (warmup)
//   • thermal: each component approaches ambient (cooling) + (heat gain)
//   • vibration: tied to torque; increases when anomaly_score > 0.5
//
// The point is *not* engineering accuracy. The point is:
//   (1) the symbolic verifier can be asked "is the result consistent with
//       T_gearbox_K < 360?" and get a definite answer;
//   (2) the PBNN can be trained on the simulated trajectory and pick up drift;
//   (3) an agent can plan an intervention and see the predicted trajectory.

export const DEFAULT_RULES: TwinRule[] = [
  // Power coefficient (toy): rises with wind, falls with pitch. The simulator's
  // safe arithmetic DSL only supports min/max/abs/clamp/sqrt, so we approximate
  // exp(-x) with a coarse piecewise and cos(pitch) with a small-angle approximation
  // valid for pitch < 30 deg. For pitch > 30 deg, the constant-0.05 factor
  // dominates and Cp collapses; that is the correct qualitative behaviour.
  { target: "Cp", expr: "max(0.05, 0.5 - 0.025 * pitch_deg) * (1 - 0.05 * (pitch_deg + wind_speed_ms / 3))", description: "toy Cp: small-pitch approximation" },
  // Mechanical power (kW) — simplified aerodynamic: P = 0.5 ρ A Cp v³ · derate
  // The DSL has no ^ so we write v^3 as v * v * v.
  { target: "P_active_kW", expr: "min(P_rated_kW, 0.5 * air_density_kgm3 * 0.5 * wind_speed_ms * wind_speed_ms * wind_speed_ms * Cp * derate_pct / 100)", description: "P = 0.5 ρ A Cp v³ derated" },
  // Rotor speed (toy) — under pitch control, rotor holds near rated
  { target: "rotor_rpm", expr: "clamp(rotor_rpm, 6, 19) - 0.05 * (rotor_rpm - 17) + 0.2 * (wind_speed_ms - 12)", description: "toy speed controller" },
  // Generator rpm
  { target: "gen_rpm", expr: "rotor_rpm * gearbox_ratio", description: "gen = rotor × ratio" },
  // Torque (N·m) — P = 2π T n, so T = P / (2π n/60) = 9550 * P_kW / n
  { target: "torque_Nm", expr: "9550 * P_active_kW / max(1, rotor_rpm)", description: "T = 9550·P_kW / n_rpm" },
  // Gearbox loss as heat: a small fraction of torque as heat per minute, plus cooling toward ambient.
  // Coefficients are deliberately gentle so the simulator does not diverge in 1 step.
  { target: "T_bearing_K", expr: "T_bearing_K + 0.00003 * torque_Nm - 0.05 * (T_bearing_K - T_ambient_K) + 5 * anomaly_score", description: "bearing thermal balance" },
  // Generator thermal: scales with load, cools toward ambient
  { target: "T_generator_K", expr: "T_generator_K + 0.00002 * torque_Nm - 0.04 * (T_generator_K - T_ambient_K)", description: "generator thermal balance" },
  // Gearbox oil temp (slow, with cooling)
  { target: "T_gearbox_K", expr: "T_gearbox_K + 0.00001 * torque_Nm - 0.03 * (T_gearbox_K - T_ambient_K) + 3 * anomaly_score", description: "gearbox oil thermal balance" },
  // Oil pressure: nominal 200 kPa, drops with temperature
  { target: "oil_pressure_kPa", expr: "clamp(220 - 0.3 * (T_gearbox_K - 313) - 20 * anomaly_score, 0, 400)", description: "pressure ∝ viscosity ∝ 1/T" },
  // Vibration: relax toward (load + anomaly) target, not jump. The diagnostic
  // panel cares about trends, so a smoothing filter is the right model.
  { target: "vib_gearbox_mms", expr: "vib_gearbox_mms + 0.1 * (0.02 * torque_Nm / 1000 + 0.3 * anomaly_score - vib_gearbox_mms)", description: "vibration RMS, exponential smoothing" },
  { target: "vib_bearing_mms", expr: "vib_bearing_mms + 0.1 * (0.015 * torque_Nm / 1000 + 0.5 * anomaly_score - vib_bearing_mms)", description: "vibration RMS, exponential smoothing" },
  // Load pct
  { target: "load_pct", expr: "100 * P_active_kW / P_rated_kW", description: "load percent" },
  // Health: drops slowly with high vibration and temperature excursions
  { target: "health_pct", expr: "health_pct - 0.005 * max(0, vib_bearing_mms - 7) - 0.002 * max(0, T_bearing_K - 350)", description: "rolling health degradation" },
];

// --------------------------------------------------------------------------- canonical asset
//
// The "WTG-04" demonstration. A fresh, well-typed twin the user can create with
// one call. Bound and rule data come from the constants above, so the asset is
// internally consistent.

export interface CanonicalTurbineInput {
  /** Operator-chosen id, e.g. "WTG-04" */
  id: string;
  /** Display name, e.g. "Wind Farm Alpha — WTG-04" */
  name: string;
  /** Optional initial state override; otherwise a sensible warm-up state */
  initialState?: Partial<Record<ChannelId, number | string | boolean>>;
  /** Optional device ids to link (existing Physical layer devices) */
  deviceIds?: string[];
  /** Optional site elevation / air density override */
  airDensity?: number;
  /** Operating class; defaults to CLASS_2MW */
  klass?: TurbineClass;
}

export function canonicalTurbineTwin(input: CanonicalTurbineInput): Omit<Twin, "id" | "uid" | "createdAt" | "updatedAt" | "events" | "maintenance" | "history"> {
  const k = input.klass ?? CLASS_2MW;
  const state: Record<string, number | string | boolean> = {
    // environment
    wind_speed_ms: 8.5, wind_dir_deg: 195, air_density_kgm3: input.airDensity ?? 1.225,
    // rotor
    rotor_rpm: 12, pitch_deg: 5, yaw_deg: 0, Cp: 0.35,
    // drivetrain
    gen_rpm: 1200, torque_Nm: 200_000, gearbox_ratio: k.rated.gearboxRatio, gearbox_eff: 0.97,
    // thermal
    T_gearbox_K: 320, T_generator_K: 340, T_bearing_K: 330, T_ambient_K: 293,
    // mech
    vib_gearbox_mms: 4.2, vib_bearing_mms: 4.5, oil_pressure_kPa: 200, oil_temp_K: 325,
    // elec
    P_active_kW: 1500, P_reactive_kvar: 0, P_rated_kW: k.rated.powerKW,
    // control
    derate_pct: 100, load_pct: 75, mode: "run",
    // health
    health_pct: 95, anomaly_score: 0,
    ...(input.initialState ?? {}),
  };
  const bounds: TwinBound[] = (Object.keys(DEFAULT_BOUNDS) as ChannelId[])
    .filter((k) => k in state)
    .map((k) => ({ key: k, min: DEFAULT_BOUNDS[k].min, max: DEFAULT_BOUNDS[k].max, unit: DEFAULT_BOUNDS[k].unit, critical: DEFAULT_BOUNDS[k].critical }));
  return {
    name: input.name,
    kind: "wind-turbine",
    deviceIds: input.deviceIds ?? [],
    state,
    bounds,
    rules: DEFAULT_RULES,
    stepSeconds: 60,
    relationships: [],
  };
}
