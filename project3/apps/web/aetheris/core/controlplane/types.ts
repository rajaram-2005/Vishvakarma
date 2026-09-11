/**
 * AETHERIS v2 — Outer Control Plane Type Definitions
 *
 * Implements the 12-Phase Gated Intelligence Architecture:
 * Phase 0: Intake Gate
 * Phase 1: Understanding
 * Phase 2: Decomposition
 * Phase 3: Evidence & Memory Retrieval
 * Phase 4: Intelligence Routing
 * Phase 5: Core Execution
 * Phase 6: World Model / Simulation
 * Phase 7: Adversarial Critique
 * Phase 8: Verification
 * Phase 9: Uncertainty + Safety Gate
 * Phase 10: Decision Gate
 * Phase 11: Delivery / Execution
 * Phase 12: Learning, Testing & Regression
 */

export type PhaseId = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

// --------------------------------------------------------------------------- fault injection

/**
 * The canonical fault-injection vocabulary for a pipeline run.
 *
 * One definition, three consumers: `ControlPlaneSupervisor.executeTask`, `POST /api/control-plane`
 * and the /control-plane runner UI. The route and the page used to restate this union inline, and the
 * page restated a *narrower* copy of it — so the same value had two different types depending on which
 * side of the boundary you were standing on. Values a client sends are checked with
 * `isInjectedFailure` before they reach the supervisor; nothing is cast into this union.
 */
export const INJECTED_FAILURES = ["none", "missing_evidence", "contradiction", "safety_block"] as const;
export type InjectedFailure = (typeof INJECTED_FAILURES)[number];

/** Runtime guard for the fault-injection vocabulary. Never trust a cast from parsed JSON. */
export function isInjectedFailure(value: unknown): value is InjectedFailure {
  return typeof value === "string" && (INJECTED_FAILURES as readonly string[]).includes(value);
}

/**
 * Loopback ceiling for one run, and the normalizer that enforces it.
 *
 * `task.loopbackCount < task.maxLoopbacksAllowed` is the only thing that stops the Phase 7 → Phase 3
 * recovery loop, so the ceiling is a resource limit, not a preference: a request that supplies
 * `maxLoopbacks: 1e9` together with `injectedFailure: "contradiction"` would otherwise re-run phases
 * 3–7 for as long as the process lived, holding a server worker and growing the task record on every
 * pass. `normalizeMaxLoopbacks` is the single place that turns an untrusted number into a safe
 * integer; the supervisor applies it even for programmatic callers, so the limit cannot be bypassed
 * by going around the route.
 */
export const DEFAULT_MAX_LOOPBACKS = 3;
export const MAX_LOOPBACKS_LIMIT = 10;

/** Clamp an untrusted loopback ceiling to a safe integer in [0, MAX_LOOPBACKS_LIMIT]. */
export function normalizeMaxLoopbacks(value: unknown, fallback = DEFAULT_MAX_LOOPBACKS): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(MAX_LOOPBACKS_LIMIT, Math.max(0, Math.trunc(value)));
}

export type ControlPlaneState =
  | "RECEIVED"
  | "UNDERSTANDING"
  | "DECOMPOSING"
  | "RETRIEVING"
  | "ROUTING"
  | "EXECUTING"
  | "SIMULATING"
  | "CRITIQUING"
  | "VERIFYING"
  | "RISK_CHECK"
  | "DECIDING"
  | "DELIVERING"
  | "LEARNING"
  | "COMPLETED"
  | "WAITING_FOR_USER"
  | "WAITING_FOR_DATA"
  | "WAITING_FOR_APPROVAL"
  | "ABSTAINED"
  | "BLOCKED"
  | "FAILED"
  | "RECOVERING"
  | "CANCELLED";

export type GateVerdict =
  | "PASS"
  | "FAIL"
  | "CLARIFICATION"
  | "BLOCK"
  | "REJECT"
  | "RETRY"
  | "LOOPBACK";

export type TaskIntent =
  | "informational"
  | "analytical"
  | "simulation"
  | "tool_execution"
  | "physical_world_action";

export type EvidenceCategory =
  | "telemetry"
  | "historical"
  | "semantic"
  | "visual"
  | "procedural"
  | "external";

export interface EvidenceItem {
  id: string;
  category: EvidenceCategory;
  source: string;
  timestamp: number;
  relevance: number; // 0..1
  reliability: number; // 0..1
  freshness: number; // 0..1
  provenance: string;
  content: string | Record<string, unknown>;
  verified?: boolean;
}

export interface EvidenceBundle {
  items: EvidenceItem[];
  qualityScore: number; // 0..1
  sufficient: boolean;
  conflicting: boolean;
  conflicts: { itemAId: string; itemBId: string; description: string }[];
}

export interface SubtaskDefinition {
  id: string; // e.g. "TASK-001"
  name: string;
  objective: string;
  requiredCores: string[];
  requiredTools: string[];
  dependencies: string[]; // parent subtask IDs
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  output?: unknown;
}

export interface TaskDecomposition {
  subtasks: SubtaskDefinition[];
  dependencyGraphValid: boolean;
  estimatedSteps: number;
}

export interface CoreExecutionRecord {
  coreId: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  modelUsed?: string;
  toolsInvoked: string[];
  latencyMs: number;
  errors: string[];
  evidenceIds: string[];
  confidence: number;
  status: "started" | "observed" | "completed" | "failed" | "retried";
}

export type SimulationValidationStatus =
  | "PREDICTED"
  | "SIMULATED"
  | "OBSERVED"
  | "VERIFIED";

export interface SimulationRecord {
  modelVersion: string;
  inputs: Record<string, unknown>;
  assumptions: string[];
  constraints: string[];
  scenario: string;
  futureState: Record<string, number | string | boolean>;
  metrics: {
    temperature_K?: number;
    vibration_mms?: number;
    power_kW?: number;
    efficiency_pct?: number;
    health_score?: number;
    risk_level?: "low" | "medium" | "high" | "critical";
  };
  uncertainty: "low" | "medium" | "high";
  validationStatus: SimulationValidationStatus;
  breachesDetected: string[];
}

export interface CritiqueProblem {
  kind:
    | "contradiction"
    | "unsupported_claim"
    | "missing_evidence"
    | "incorrect_assumption"
    | "calculation_error"
    | "policy_violation"
    | "alternative_explanation";
  description: string;
  severity: "critical" | "warning" | "advisory";
  suggestedLoopbackPhase: PhaseId;
}

export interface CritiqueRecord {
  hasProblems: boolean;
  problems: CritiqueProblem[];
  unsupportedClaims: string[];
  calculationErrors: string[];
  alternativeExplanations: string[];
  loopbackRecommended: boolean;
  targetLoopbackPhase: PhaseId | null;
}

export type VerificationStatus =
  | "VERIFIED"
  | "PARTIALLY_VERIFIED"
  | "UNVERIFIED"
  | "CONTRADICTED";

export interface VerificationMatrix {
  status: VerificationStatus;
  factualConsistency: boolean;
  numericalConsistency: boolean;
  evidenceConsistency: boolean;
  sourceConsistency: boolean;
  modelAgreement: boolean;
  constraintConsistency: boolean;
  toolResultConsistency: boolean;
  simulationConsistency: boolean;
  score: number; // 0..1
  notes: string[];
}

export type SafetyGateStatus =
  | "LOW_RISK"
  | "MEDIUM_RISK"
  | "HIGH_RISK"
  | "PROHIBITED";

export interface UncertaintySafetyReport {
  confidence: number; // 0..100%
  uncertainty: "low" | "medium" | "high";
  operationalRisk: "low" | "medium" | "high" | "prohibited";
  safetyGate: SafetyGateStatus;
  requiresHumanApproval: boolean;
  prohibitedReason?: string;
  safetyInterlocksChecked: string[];
}

export type DecisionState =
  | "RECOMMEND"
  | "EXECUTE_WITH_APPROVAL"
  | "EXECUTE"
  | "ABSTAIN"
  | "REQUEST_DATA"
  | "ESCALATE"
  | "BLOCK";

export interface ControlPlaneDecision {
  state: DecisionState;
  summary: string;
  reasoning: string[];
  actionsProposed: Array<{
    target: string;
    action: string;
    parameters: Record<string, unknown>;
    risk: "low" | "medium" | "high";
  }>;
  safetyNotes: string[];
  requiresApproval: boolean;
  approvalToken?: string;
}

export interface PhaseContract {
  phaseId: PhaseId;
  phaseKey: string;
  name: string;
  requiredInputs: string[];
  responsibleCore: string;
  dependencies: PhaseId[];
  timeoutMs: number;
  retryPolicy: { maxRetries: number; backoffMs: number };
  outputSchema: string;
  validationRules: string[];
  successConditions: string[];
  failureConditions: string[];
  nextPhase: PhaseId | null;
}

export interface PhaseExecutionRecord {
  phaseId: PhaseId;
  phaseKey: string;
  name: string;
  startedAt: number;
  endedAt: number | null;
  durationMs: number | null;
  status: "pending" | "running" | "passed" | "failed" | "blocked" | "loopback";
  gateVerdict: GateVerdict;
  gateReason: string;
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
  activeAgents: string[];
  activeTools: string[];
  activeModels: string[];
  errors: string[];
  loopbackTargetPhase?: PhaseId;
}

export interface ExecutionProvenanceNode {
  id: string;
  type: "phase" | "core" | "tool" | "evidence" | "result";
  label: string;
  detail: string;
  status: "ok" | "warn" | "fail" | "blocked";
  children?: ExecutionProvenanceNode[];
}

export interface ControlPlaneTaskRecord {
  id: string;
  uid: string;
  rawRequest: string;
  state: ControlPlaneState;
  currentPhase: PhaseId;
  progressPct: number; // 0..100
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  phases: Record<PhaseId, PhaseExecutionRecord>;
  understanding?: {
    objective: string;
    intent?: TaskIntent;
    constraints: string[];
    assets: string[];
    expectedOutput: string;
    risk: "low" | "medium" | "high";
    requiredEvidence: string[];
    allowedActions: string[];
  };
  decomposition?: TaskDecomposition;
  evidenceBundle?: EvidenceBundle;
  coreExecutions: CoreExecutionRecord[];
  simulation?: SimulationRecord;
  critique?: CritiqueRecord;
  verification?: VerificationMatrix;
  uncertaintySafety?: UncertaintySafetyReport;
  decision?: ControlPlaneDecision;
  deliveryResult?: {
    channel: "informational" | "tool_execution" | "physical_control";
    delivered: boolean;
    output: unknown;
    executedAt: number;
  };
  learningTrace?: {
    testableTraceId: string;
    regressionGenerated: boolean;
    regressionTestId?: string;
  };
  loopbackCount: number;
  maxLoopbacksAllowed: number;
  provenanceGraph?: ExecutionProvenanceNode;
}
