/**
 * Incident Command Mode Engine
 *
 * Automatically triggered when a critical anomaly, bound breach, or safety trip occurs:
 * ┌───────────────────────────────────────────────────────────────┐
 * │ INCIDENT COMMAND                                              │
 * │ WTG-04 / GEARBOX                                              │
 * ├───────────────────────────────────────────────────────────────┤
 * │ PHASE: 07 CRITIQUE                                            │
 * │                                                               │
 * │ GRAPH                  DIGITAL TWIN                           │
 * │                                                               │
 * │ RAVANA ●────NIRIKSHAN  ┌─────────────────┐                    │
 * │          ╲             │     WTG-04      │                    │
 * │           VIB-ALPHA    │      🔴         │                    │
 * │                        │    GEARBOX      │                    │
 * │                        └─────────────────┘                    │
 * ├───────────────────────────────────────────────────────────────┤
 * │ EVIDENCE │ TELEMETRY │ SIMULATION │ UNCERTAINTY │ SAFETY      │
 * ├───────────────────────────────────────────────────────────────┤
 * │ EXECUTION TIMELINE                                            │
 * └───────────────────────────────────────────────────────────────┘
 */
import type { PhaseId } from "../types";
import { asEnum, asFiniteNumber, asInteger, asRecord, asString, asStringArray } from "../../security/validate";

export interface IncidentState {
  incidentId: string;
  active: boolean;
  assetId: string;
  subsystem: string;
  severity: "critical" | "high" | "medium";
  currentPhase: PhaseId;
  phaseName: string;
  triggerReason: string;
  timestamp: number;
  telemetrySnapshot: {
    rotor_rpm: number;
    vib_bearing_mms: number;
    gearbox_temp_K: number;
    active_power_kW: number;
    threshold_mms: number;
  };
  activeAgents: string[];
  activeCores: string[];
  recommendedAction: {
    action: string;
    deratePct: number;
    expectedTempDropK: number;
    expectedVibDropMms: number;
    requiresHumanSignoff: boolean;
  };
  timeline: Array<{ time: string; event: string; severity: "info" | "warn" | "critical" }>;
}

let CURRENT_INCIDENT: IncidentState | null = {
  incidentId: "inc-wtg04-gbx-001",
  active: true,
  assetId: "WTG-04",
  subsystem: "GEARBOX_DRIVETRAIN",
  severity: "critical",
  currentPhase: 7,
  phaseName: "PHASE 07 — CRITIQUE",
  triggerReason: "Vibration amplitude 8.4 mm/s exceeded ISO 10816 Warning threshold (7.1 mm/s) with BPFO bearing harmonic.",
  timestamp: Date.now() - 120_000,
  telemetrySnapshot: {
    rotor_rpm: 1500,
    vib_bearing_mms: 8.4,
    gearbox_temp_K: 338.2,
    active_power_kW: 1850,
    threshold_mms: 7.1,
  },
  activeAgents: ["RAVANA", "NIRIKSHAN", "VIB-ALPHA", "NIRNAYA"],
  activeCores: ["RAVANA", "NIRIKSHAN", "PRAVAAH", "YANTRA", "NIRNAYA"],
  recommendedAction: {
    action: "Derate WTG-04 by 15% to 1275 RPM & dispatch visual inspection",
    deratePct: 15,
    expectedTempDropK: 14.5,
    expectedVibDropMms: 2.1,
    requiresHumanSignoff: true,
  },
  timeline: [
    { time: "T-02:00", event: "SCADA Ingestion: High vibration alarm triggered on channel vib_bearing_mms", severity: "warn" },
    { time: "T-01:45", event: "NIRIKSHAN FFT Analysis: 89.3 Hz peak identified matching BPFO outer race defect", severity: "critical" },
    { time: "T-01:10", event: "World Model Simulation: 15% derate stabilizes bearing temp at 323.7 K", severity: "info" },
    { time: "T-00:30", event: "Adversarial Critique: 2 alternative explanations evaluated (1P imbalance vs BPFO)", severity: "warn" },
    { time: "T-00:05", event: "NIRNAYA Safety Gate: Operator confirmation token issued for derating dispatch", severity: "info" },
  ],
};

export function getActiveIncident(): IncidentState | null {
  return CURRENT_INCIDENT;
}

/** The defaults every field falls back to. Also the shape `sanitizeIncidentInput` validates against. */
const INCIDENT_DEFAULTS = {
  assetId: "WTG-04",
  subsystem: "GEARBOX",
  severity: "critical",
  currentPhase: 7,
  phaseName: "PHASE 07 — CRITIQUE",
  triggerReason: "Anomaly detected",
  telemetrySnapshot: {
    rotor_rpm: 1500,
    vib_bearing_mms: 8.4,
    gearbox_temp_K: 338.2,
    active_power_kW: 1850,
    threshold_mms: 7.1,
  },
  activeAgents: ["RAVANA", "NIRIKSHAN", "NIRNAYA"],
  activeCores: ["RAVANA", "NIRIKSHAN", "YANTRA", "NIRNAYA"],
  recommendedAction: {
    action: "Derate WTG-04 by 15%",
    deratePct: 15,
    expectedTempDropK: 14.5,
    expectedVibDropMms: 2.1,
  },
} as const;

export const INCIDENT_SEVERITIES = ["critical", "high", "medium"] as const;
export const INCIDENT_TIMELINE_SEVERITIES = ["info", "warn", "critical"] as const;

/**
 * Fields a caller may never set, because the server owns them: an incident's identity, its liveness
 * and its timestamp are facts about this process, not opinions from a request body.
 */
const SERVER_CONTROLLED_FIELDS = ["incidentId", "active", "timestamp"] as const;

/**
 * What a caller may actually supply when triggering an incident.
 *
 * Structurally narrower than `Partial<IncidentState>` on purpose:
 *   - `incidentId`, `active` and `timestamp` are absent, so the server-owned identity of an incident
 *     cannot be forged even by a caller with the right types;
 *   - the nested objects are partial, because a caller that supplies one telemetry reading must not be
 *     forced to invent the other four (and must not have the rest silently blanked);
 *   - `requiresHumanSignoff` is not in the type at all. The recommended action for this asset is a
 *     physical derate, so the signoff requirement is a property of the action. Making it untypable is
 *     stronger than validating it.
 */
export type IncidentInput = Omit<
  Partial<IncidentState>,
  "incidentId" | "active" | "timestamp" | "telemetrySnapshot" | "recommendedAction" | "timeline"
> & {
  telemetrySnapshot?: Partial<IncidentState["telemetrySnapshot"]>;
  recommendedAction?: Partial<Omit<IncidentState["recommendedAction"], "requiresHumanSignoff">>;
  timeline?: IncidentState["timeline"];
};

export interface SanitizedIncidentInput {
  /** Only well-typed fields. `triggerIncident` fills every gap from `INCIDENT_DEFAULTS`. */
  incident: IncidentInput;
  /**
   * What was dropped and why — including server-controlled keys the caller tried to set. The route
   * returns this so an Incident Command screen built from a partly-rejected payload says so instead of
   * quietly showing defaults.
   */
  ignored: string[];
}

/**
 * Turn an untrusted incident payload into a typed `Partial<IncidentState>`.
 *
 * Incident Command is the surface an operator reads while a physical asset is in a critical state, so
 * its contents have to survive contact with a hostile or merely buggy client:
 *
 *   - `severity`, `currentPhase` and the timeline severities are closed vocabularies. An invented
 *     value would render as an unknown colour/label on a screen whose whole job is triage.
 *   - `telemetrySnapshot` accepts only finite numbers. These are the readings the operator compares
 *     against thresholds; `NaN` or a string here is worse than a missing value.
 *   - `recommendedAction.requiresHumanSignoff` is **not accepted from input at all**. The recommended
 *     action for this asset is a derate of a wind turbine gearbox — a physical intervention — so the
 *     signoff requirement is a property of the action, not a parameter of the request. `triggerIncident`
 *     sets it unconditionally; see the comment there.
 */
export function sanitizeIncidentInput(raw: unknown): SanitizedIncidentInput {
  const ignored: string[] = [];
  const body = asRecord(raw);
  if (!body) return { incident: {}, ignored: ["body: expected a JSON object, using defaults"] };

  const incident: IncidentInput = {};

  for (const key of SERVER_CONTROLLED_FIELDS) {
    if (key in body) ignored.push(`${key}: server-controlled, ignored`);
  }

  const assetId = body.assetId === undefined ? undefined : asString(body.assetId, 64);
  if (assetId) incident.assetId = assetId;
  else if (body.assetId !== undefined) ignored.push("assetId: must be a string of at most 64 characters");

  const subsystem = body.subsystem === undefined ? undefined : asString(body.subsystem, 64);
  if (subsystem) incident.subsystem = subsystem;
  else if (body.subsystem !== undefined) ignored.push("subsystem: must be a string of at most 64 characters");

  const severity = body.severity === undefined ? undefined : asEnum(body.severity, INCIDENT_SEVERITIES);
  if (severity) incident.severity = severity;
  else if (body.severity !== undefined) ignored.push(`severity: must be one of ${INCIDENT_SEVERITIES.join(", ")}`);

  const currentPhase = body.currentPhase === undefined ? undefined : asInteger(body.currentPhase, { min: 0, max: 12 });
  if (currentPhase !== undefined && currentPhase !== null) incident.currentPhase = currentPhase as PhaseId;
  else if (body.currentPhase !== undefined) ignored.push("currentPhase: must be an integer phase id 0–12");

  const phaseName = body.phaseName === undefined ? undefined : asString(body.phaseName, 128);
  if (phaseName) incident.phaseName = phaseName;
  else if (body.phaseName !== undefined) ignored.push("phaseName: must be a string of at most 128 characters");

  const triggerReason = body.triggerReason === undefined ? undefined : asString(body.triggerReason, 512);
  if (triggerReason) incident.triggerReason = triggerReason;
  else if (body.triggerReason !== undefined) ignored.push("triggerReason: must be a string of at most 512 characters");

  if (body.telemetrySnapshot !== undefined) {
    const snap = asRecord(body.telemetrySnapshot);
    if (!snap) {
      ignored.push("telemetrySnapshot: must be an object of numbers");
    } else {
      const telemetry: Partial<IncidentState["telemetrySnapshot"]> = {};
      for (const key of Object.keys(INCIDENT_DEFAULTS.telemetrySnapshot) as Array<keyof typeof INCIDENT_DEFAULTS.telemetrySnapshot>) {
        if (snap[key] === undefined) continue;
        const n = asFiniteNumber(snap[key]);
        if (n === null) ignored.push(`telemetrySnapshot.${key}: must be a finite number`);
        else telemetry[key] = n;
      }
      for (const key of Object.keys(snap)) {
        if (!(key in INCIDENT_DEFAULTS.telemetrySnapshot)) ignored.push(`telemetrySnapshot.${key}: not a known telemetry channel`);
      }
      if (Object.keys(telemetry).length) incident.telemetrySnapshot = telemetry;
    }
  }

  const activeAgents = body.activeAgents === undefined ? undefined : asStringArray(body.activeAgents, { maxItems: 32, maxItemLength: 64 });
  if (activeAgents) incident.activeAgents = activeAgents;
  else if (body.activeAgents !== undefined) ignored.push("activeAgents: must be an array of at most 32 short strings");

  const activeCores = body.activeCores === undefined ? undefined : asStringArray(body.activeCores, { maxItems: 32, maxItemLength: 64 });
  if (activeCores) incident.activeCores = activeCores;
  else if (body.activeCores !== undefined) ignored.push("activeCores: must be an array of at most 32 short strings");

  if (body.recommendedAction !== undefined) {
    const rec = asRecord(body.recommendedAction);
    if (!rec) {
      ignored.push("recommendedAction: must be an object");
    } else {
      const action: NonNullable<IncidentInput["recommendedAction"]> = {};
      const text = rec.action === undefined ? undefined : asString(rec.action, 200);
      if (text) action.action = text;
      else if (rec.action !== undefined) ignored.push("recommendedAction.action: must be a string of at most 200 characters");

      const deratePct = rec.deratePct === undefined ? undefined : asFiniteNumber(rec.deratePct, { min: 0, max: 100 });
      if (deratePct !== undefined && deratePct !== null) action.deratePct = deratePct;
      else if (rec.deratePct !== undefined) ignored.push("recommendedAction.deratePct: must be a number between 0 and 100");

      const tempDrop = rec.expectedTempDropK === undefined ? undefined : asFiniteNumber(rec.expectedTempDropK);
      if (tempDrop !== undefined && tempDrop !== null) action.expectedTempDropK = tempDrop;
      else if (rec.expectedTempDropK !== undefined) ignored.push("recommendedAction.expectedTempDropK: must be a finite number");

      const vibDrop = rec.expectedVibDropMms === undefined ? undefined : asFiniteNumber(rec.expectedVibDropMms);
      if (vibDrop !== undefined && vibDrop !== null) action.expectedVibDropMms = vibDrop;
      else if (rec.expectedVibDropMms !== undefined) ignored.push("recommendedAction.expectedVibDropMms: must be a finite number");

      // The one field that is never read from input, whatever the caller sent.
      if ("requiresHumanSignoff" in rec) {
        ignored.push("recommendedAction.requiresHumanSignoff: a physical intervention always requires signoff; ignored");
      }

      if (Object.keys(action).length) incident.recommendedAction = action;
    }
  }

  if (body.timeline !== undefined) {
    const rawTimeline = body.timeline;
    if (!Array.isArray(rawTimeline) || rawTimeline.length > 64) {
      ignored.push("timeline: must be an array of at most 64 entries");
    } else {
      const timeline: IncidentState["timeline"] = [];
      rawTimeline.forEach((entry, i) => {
        const row = asRecord(entry);
        const time = row ? asString(row.time, 64) : null;
        const event = row ? asString(row.event, 256) : null;
        const sev = row ? asEnum(row.severity, INCIDENT_TIMELINE_SEVERITIES) : null;
        if (!time || !event || !sev) ignored.push(`timeline[${i}]: needs {time, event, severity: ${INCIDENT_TIMELINE_SEVERITIES.join("|")}}`);
        else timeline.push({ time, event, severity: sev });
      });
      incident.timeline = timeline;
    }
  }

  // Anything else the caller sent is reported rather than silently discarded: an Incident Command
  // screen must not look like it accepted a payload it ignored half of.
  const KNOWN = new Set<string>([...Object.keys(INCIDENT_DEFAULTS), "timeline", ...SERVER_CONTROLLED_FIELDS]);
  for (const key of Object.keys(body)) {
    if (!KNOWN.has(key)) ignored.push(`${key}: not a known incident field`);
  }

  return { incident, ignored };
}

export function triggerIncident(data: IncidentInput): IncidentState {
  const snapshot = data.telemetrySnapshot;
  const action = data.recommendedAction;
  CURRENT_INCIDENT = {
    incidentId: `inc_${Date.now().toString(36)}`,
    active: true,
    assetId: data.assetId ?? INCIDENT_DEFAULTS.assetId,
    subsystem: data.subsystem ?? INCIDENT_DEFAULTS.subsystem,
    severity: data.severity ?? INCIDENT_DEFAULTS.severity,
    currentPhase: data.currentPhase ?? INCIDENT_DEFAULTS.currentPhase,
    phaseName: data.phaseName ?? INCIDENT_DEFAULTS.phaseName,
    triggerReason: data.triggerReason ?? INCIDENT_DEFAULTS.triggerReason,
    timestamp: Date.now(),
    // Merged per field, not replaced wholesale: a caller that supplies one reading used to blank the
    // other four to `undefined`, which the Incident Command panel then rendered as "-undefined K".
    telemetrySnapshot: {
      rotor_rpm: snapshot?.rotor_rpm ?? INCIDENT_DEFAULTS.telemetrySnapshot.rotor_rpm,
      vib_bearing_mms: snapshot?.vib_bearing_mms ?? INCIDENT_DEFAULTS.telemetrySnapshot.vib_bearing_mms,
      gearbox_temp_K: snapshot?.gearbox_temp_K ?? INCIDENT_DEFAULTS.telemetrySnapshot.gearbox_temp_K,
      active_power_kW: snapshot?.active_power_kW ?? INCIDENT_DEFAULTS.telemetrySnapshot.active_power_kW,
      threshold_mms: snapshot?.threshold_mms ?? INCIDENT_DEFAULTS.telemetrySnapshot.threshold_mms,
    },
    activeAgents: data.activeAgents ?? [...INCIDENT_DEFAULTS.activeAgents],
    activeCores: data.activeCores ?? [...INCIDENT_DEFAULTS.activeCores],
    recommendedAction: {
      action: action?.action ?? INCIDENT_DEFAULTS.recommendedAction.action,
      deratePct: action?.deratePct ?? INCIDENT_DEFAULTS.recommendedAction.deratePct,
      expectedTempDropK: action?.expectedTempDropK ?? INCIDENT_DEFAULTS.recommendedAction.expectedTempDropK,
      expectedVibDropMms: action?.expectedVibDropMms ?? INCIDENT_DEFAULTS.recommendedAction.expectedVibDropMms,
      /**
       * Safety gate, unconditional. The recommended action here is a derate of a physical wind-turbine
       * gearbox, so "a human must sign off" is a property of the action — not a field a request body, a
       * caller, or a confident model gets to set. Nothing upstream can turn this off.
       */
      requiresHumanSignoff: true,
    },
    timeline: data.timeline ?? [],
  };
  return CURRENT_INCIDENT;
}

export function clearIncident(): void {
  if (CURRENT_INCIDENT) {
    CURRENT_INCIDENT.active = false;
  }
}
