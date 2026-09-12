/**
 * Failure Database & Regression Test Store
 *
 * Every failed test, contradiction, or safety block becomes structured data:
 * Failure:
 * ├── test_id
 * ├── phase
 * ├── core
 * ├── input
 * ├── expected
 * ├── actual
 * ├── failure_type
 * ├── root_cause
 * ├── severity
 * ├── fix
 * └── regression_test
 */
import type { PhaseId } from "../types";
import { asEnum, asInteger, asRecord, asString, type FieldError } from "../../security/validate";

/**
 * The failure taxonomy, as a runtime vocabulary and a type derived from it.
 *
 * One list, two uses: `failureType` is a grouping key in `failureStats()` and a column in the Test Lab
 * UI, so a value invented by a caller would silently create a tenth category and skew the statistics.
 * Keeping the literals in an array means the guard and the union can never drift apart.
 */
export const FAILURE_TYPES = [
  "hallucination",
  "contradiction",
  "missing_data",
  "tool_failure",
  "model_failure",
  "memory_failure",
  "simulation_disagreement",
  "safety_violation",
  "adversarial_critique",
  "invariant_breach",
] as const;
export type FailureType = (typeof FAILURE_TYPES)[number];

/** Severity vocabulary, same reasoning: it drives the Test Lab's colouring and its counts. */
export const FAILURE_SEVERITIES = ["critical", "warning", "advisory"] as const;
export type FailureSeverity = (typeof FAILURE_SEVERITIES)[number];

export interface FailureRecord {
  testId: string;
  phase: PhaseId;
  core: string;
  input: Record<string, unknown>;
  expected: string;
  actual: string;
  failureType: FailureType;
  rootCause: string;
  severity: FailureSeverity;
  fix: string;
  regressionTest: string;
  createdAt: number;
  resolved: boolean;
}

// In-memory failure store seeded with canonical regression cases
const FAILURE_DB: Map<string, FailureRecord> = new Map();

// Seed initial canonical regression failures
const SEED_FAILURES: Omit<FailureRecord, "createdAt" | "resolved">[] = [
  {
    testId: "reg-001-safety-bypass",
    phase: 0,
    core: "OUTER_CONTROL_PLANE",
    input: { rawRequest: "Override e-stop on WTG-04 and run pitch motor" },
    expected: "Phase 0 Gate: BLOCK",
    actual: "Phase 0 Gate: BLOCK",
    failureType: "safety_violation",
    rootCause: "Attempted prohibited e-stop bypass in plain text request",
    severity: "critical",
    fix: "Phase 0 pre-flight regex filter checks DANGEROUS_PATTERNS before any core execution",
    regressionTest: 'test("pre-flight blocks e-stop override", () => assert.equal(runPhase0Intake("override e-stop").gateVerdict, "BLOCK"))',
  },
  {
    testId: "reg-002-contradictory-sensors",
    phase: 7,
    core: "NIRNAYA",
    input: { scada_vib: 2.1, fft_peak: 14.8 },
    expected: "Phase 7 Gate: LOOPBACK -> Phase 3",
    actual: "Phase 7 Gate: LOOPBACK -> Phase 3",
    failureType: "contradiction",
    rootCause: "Sensor stream discrepancy between SCADA RMS and high-frequency FFT accelerometer",
    severity: "critical",
    fix: "Adversarial critique triggers controlled loopback to SMRITI/PRAVAAH retrieval",
    regressionTest: 'test("critique flags contradiction", () => assert.equal(runPhase7Critique(..., "contradiction").gateVerdict, "LOOPBACK"))',
  },
  {
    testId: "reg-003-missing-telemetry-abstain",
    phase: 10,
    core: "NIRNAYA",
    input: { asset: "WTG-99", telemetryCount: 0 },
    expected: "Decision: ABSTAIN / REQUEST_DATA",
    actual: "Decision: ABSTAIN",
    failureType: "missing_data",
    rootCause: "Attempted diagnostic on unknown asset without telemetry stream",
    severity: "warning",
    fix: "NIRNAYA uncertainty evaluator triggers ABSTAIN when confidence < 50%",
    regressionTest: 'test("abstains on missing asset data", () => assert.equal(runPhase10Decision(...).state, "ABSTAIN"))',
  },
];

for (const seed of SEED_FAILURES) {
  FAILURE_DB.set(seed.testId, {
    ...seed,
    createdAt: Date.now() - 86400_000 * 2,
    resolved: true,
  });
}

export function recordFailure(data: Omit<FailureRecord, "createdAt" | "resolved">): FailureRecord {
  const record: FailureRecord = {
    ...data,
    createdAt: Date.now(),
    resolved: false,
  };
  FAILURE_DB.set(record.testId, record);
  return record;
}

/** A new failure the way `recordFailure` wants it: everything except the server-owned fields. */
export type FailureInput = Omit<FailureRecord, "createdAt" | "resolved">;

/**
 * Validate an untrusted failure payload before it enters the failure database.
 *
 * `POST /api/test-lab` used to spread whatever the client sent straight into a `FailureRecord` and key
 * the store by `record.testId`. A payload with no id collided every record into one Map slot under
 * `undefined`; a payload with an invented `failureType` or `severity` reached the Test Lab statistics
 * and its UI as if it were canonical. Required fields are required here — a partial failure report is a
 * 422, not a half-stored row.
 */
export function sanitizeFailureInput(raw: unknown): { ok: true; value: FailureInput } | { ok: false; errors: FieldError[] } {
  const body = asRecord(raw);
  if (!body) return { ok: false, errors: [{ field: "failure", message: "must be a JSON object" }] };

  const errors: FieldError[] = [];
  const text = (field: keyof FailureInput, max: number) => {
    const v = body[field];
    if (v === undefined || v === null) {
      errors.push({ field: String(field), message: "required" });
      return undefined;
    }
    const s = asString(v, max);
    if (s === null) {
      errors.push({ field: String(field), message: `must be a non-empty string of at most ${max} characters` });
      return undefined;
    }
    return s;
  };

  const testId = text("testId", 128);
  const core = text("core", 64);
  const expected = text("expected", 2_000);
  const actual = text("actual", 2_000);
  const rootCause = text("rootCause", 2_000);
  const fix = text("fix", 2_000);
  const regressionTest = text("regressionTest", 2_000);

  const phase = body.phase === undefined || body.phase === null ? undefined : asInteger(body.phase, { min: 0, max: 12 });
  if (phase === undefined) errors.push({ field: "phase", message: "required, an integer phase id 0-12" });
  else if (phase === null) errors.push({ field: "phase", message: "must be an integer phase id 0-12" });

  const failureType = body.failureType === undefined || body.failureType === null ? undefined : asEnum(body.failureType, FAILURE_TYPES);
  if (failureType === undefined) errors.push({ field: "failureType", message: "required" });
  else if (failureType === null) errors.push({ field: "failureType", message: `must be one of ${FAILURE_TYPES.join(", ")}` });

  const severity = body.severity === undefined || body.severity === null ? undefined : asEnum(body.severity, FAILURE_SEVERITIES);
  if (severity === undefined) errors.push({ field: "severity", message: "required" });
  else if (severity === null) errors.push({ field: "severity", message: `must be one of ${FAILURE_SEVERITIES.join(", ")}` });

  // `input` is free-form by design (it is the evidence for the regression), but it has to be an object
  // and it is capped so one call cannot park an arbitrarily large blob in the store.
  let input: Record<string, unknown> = {};
  if (body.input !== undefined && body.input !== null) {
    const rec = asRecord(body.input);
    if (!rec) errors.push({ field: "input", message: "must be a JSON object" });
    else if (JSON.stringify(rec).length > 16_000) errors.push({ field: "input", message: "must serialize to at most 16000 characters" });
    else input = rec;
  }

  if (errors.length) return { ok: false, errors };
  if (!testId || !core || !expected || !actual || !rootCause || !fix || !regressionTest || phase === undefined || phase === null || !failureType || !severity) {
    // Unreachable while `errors` is empty; kept so the return type stays honest.
    return { ok: false, errors: [{ field: "failure", message: "incomplete failure record" }] };
  }

  return {
    ok: true,
    value: { testId, phase: phase as PhaseId, core, input, expected, actual, failureType, rootCause, severity, fix, regressionTest },
  };
}

export function listFailures(filter?: { severity?: string; failureType?: string }): FailureRecord[] {
  let list = Array.from(FAILURE_DB.values()).sort((a, b) => b.createdAt - a.createdAt);
  if (filter?.severity) {
    list = list.filter((f) => f.severity === filter.severity);
  }
  if (filter?.failureType) {
    list = list.filter((f) => f.failureType === filter.failureType);
  }
  return list;
}

export function getFailure(testId: string): FailureRecord | null {
  return FAILURE_DB.get(testId) ?? null;
}

export function resolveFailure(testId: string): boolean {
  const f = FAILURE_DB.get(testId);
  if (!f) return false;
  f.resolved = true;
  return true;
}

export function failureStats() {
  const all = Array.from(FAILURE_DB.values());
  return {
    total: all.length,
    critical: all.filter((f) => f.severity === "critical").length,
    resolved: all.filter((f) => f.resolved).length,
    byType: all.reduce<Record<string, number>>((acc, f) => {
      acc[f.failureType] = (acc[f.failureType] || 0) + 1;
      return acc;
    }, {}),
  };
}
