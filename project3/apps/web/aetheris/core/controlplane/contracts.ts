/**
 * Phase Contracts for all 13 phases of the AETHERIS v2 Control Plane.
 *
 * Every phase implements 4 mandatory pillars:
 * 1. Input: What must exist before the phase begins
 * 2. Processor: Responsible core / engine
 * 3. Output: Structured artifact schema
 * 4. Gate: Strict progression conditions
 *
 * Rule: No phase may silently skip a required gate.
 */
import type { PhaseContract, PhaseId } from "./types";

export const PHASE_CONTRACTS: Record<PhaseId, PhaseContract> = {
  0: {
    phaseId: 0,
    phaseKey: "intake",
    name: "Intake Gate",
    requiredInputs: ["rawRequest"],
    responsibleCore: "OUTER_CONTROL_PLANE",
    dependencies: [],
    timeoutMs: 5000,
    retryPolicy: { maxRetries: 1, backoffMs: 200 },
    outputSchema: "IntakeAnalysis",
    validationRules: [
      "rawRequest must be non-empty",
      "Intent must be classified into one of 5 canonical categories",
      "Request must pass pre-flight safety filter",
    ],
    successConditions: [
      "status == 'complete'",
      "isAmbiguous == false",
      "safetyBlocked == false",
    ],
    failureConditions: [
      "isAmbiguous == true (yields CLARIFICATION)",
      "safetyBlocked == true (yields BLOCK)",
      "rawRequest empty (yields REJECT)",
    ],
    nextPhase: 1,
  },
  1: {
    phaseId: 1,
    phaseKey: "understanding",
    name: "Understanding",
    requiredInputs: ["intakeAnalysis"],
    responsibleCore: "RAVANA",
    dependencies: [0],
    timeoutMs: 10000,
    retryPolicy: { maxRetries: 2, backoffMs: 500 },
    outputSchema: "TaskUnderstanding",
    validationRules: [
      "objective must be clearly defined",
      "constraints list must exist",
      "required_evidence must be specified",
    ],
    successConditions: [
      "objective is non-empty",
      "expected_output is specified",
    ],
    failureConditions: [
      "objective is vague or incoherent",
      "conflicting constraints detected",
    ],
    nextPhase: 2,
  },
  2: {
    phaseId: 2,
    phaseKey: "decomposition",
    name: "Decomposition",
    requiredInputs: ["taskUnderstanding"],
    responsibleCore: "RAVANA",
    dependencies: [1],
    timeoutMs: 15000,
    retryPolicy: { maxRetries: 2, backoffMs: 500 },
    outputSchema: "TaskDecomposition",
    validationRules: [
      "Subtask list must not be empty",
      "Subtask IDs must match pattern TASK-\\d{3}",
      "Dependencies must form an acyclic directed graph",
    ],
    successConditions: [
      "subtasks.length > 0",
      "dependencyGraphValid == true",
    ],
    failureConditions: [
      "cyclic dependency detected in subtasks",
      "missing responsible cores for subtasks",
    ],
    nextPhase: 3,
  },
  3: {
    phaseId: 3,
    phaseKey: "retrieval",
    name: "Evidence & Memory Retrieval",
    requiredInputs: ["taskUnderstanding", "taskDecomposition"],
    responsibleCore: "SMRITI",
    dependencies: [2],
    timeoutMs: 20000,
    retryPolicy: { maxRetries: 2, backoffMs: 1000 },
    outputSchema: "EvidenceBundle",
    validationRules: [
      "Every item must have source, timestamp, and provenance",
      "Quality score must be calibrated between 0 and 1",
    ],
    successConditions: [
      "evidenceBundle.sufficient == true",
      "evidenceBundle.conflicting == false",
    ],
    failureConditions: [
      "evidenceBundle.sufficient == false",
      "irreconcilable evidence conflicts without resolution pathway",
    ],
    nextPhase: 4,
  },
  4: {
    phaseId: 4,
    phaseKey: "routing",
    name: "Intelligence Routing",
    requiredInputs: ["taskUnderstanding", "taskDecomposition", "evidenceBundle"],
    responsibleCore: "OUTER_CONTROL_PLANE",
    dependencies: [3],
    timeoutMs: 8000,
    retryPolicy: { maxRetries: 2, backoffMs: 400 },
    outputSchema: "IntelligenceRoutingPlan",
    validationRules: [
      "Only necessary cores are activated for the specific task type",
      "Target models must be active or fallback path assigned",
    ],
    successConditions: [
      "assignedCores.length > 0",
      "selectedModels.every(m => m.available)",
    ],
    failureConditions: [
      "required core unavailable and no alternative route",
      "no working model provider reachable",
    ],
    nextPhase: 5,
  },
  5: {
    phaseId: 5,
    phaseKey: "execution",
    name: "Core Execution",
    requiredInputs: ["routingPlan", "taskDecomposition", "evidenceBundle"],
    responsibleCore: "RAVANA", // Orchestrates selected cores (NIRIKSHAN, PRAVAAH, DRISHTI, YANTRA, SETU, etc.)
    dependencies: [4],
    timeoutMs: 60000,
    retryPolicy: { maxRetries: 2, backoffMs: 1000 },
    outputSchema: "CoreExecutionBatchResult",
    validationRules: [
      "Every core execution must emit lifecycle events",
      "Outputs must match expected schemas without uncaught exceptions",
    ],
    successConditions: [
      "coreExecutions.every(c => c.status == 'completed' || c.status == 'observed')",
      "critical errors == 0",
    ],
    failureConditions: [
      "core execution failed critically after retries",
      "tool timeout / sandbox crash without recovery",
    ],
    nextPhase: 6,
  },
  6: {
    phaseId: 6,
    phaseKey: "simulation",
    name: "World Model / Simulation",
    requiredInputs: ["coreExecutionResult", "taskUnderstanding"],
    responsibleCore: "YANTRA",
    dependencies: [5],
    timeoutMs: 25000,
    retryPolicy: { maxRetries: 1, backoffMs: 500 },
    outputSchema: "SimulationRecord",
    validationRules: [
      "Explicit validationStatus: PREDICTED | SIMULATED | OBSERVED | VERIFIED",
      "What-if future state trajectory must bound key physics metrics",
    ],
    successConditions: [
      "simulation.futureState is finite and calculated",
      "metrics.health_score >= acceptable threshold or breach flagged honestly",
    ],
    failureConditions: [
      "simulation divergence or mathematical NaN",
      "unconstrained extrapolation beyond model domain",
    ],
    nextPhase: 7,
  },
  7: {
    phaseId: 7,
    phaseKey: "critique",
    name: "Adversarial Critique",
    requiredInputs: ["coreExecutionResult", "simulationRecord", "evidenceBundle"],
    responsibleCore: "OUTER_CONTROL_PLANE", // Independent critic
    dependencies: [6],
    timeoutMs: 15000,
    retryPolicy: { maxRetries: 1, backoffMs: 500 },
    outputSchema: "CritiqueRecord",
    validationRules: [
      "Critic must test for contradictions, unsupported claims, missing evidence",
      "Must not allow reasoning pathway to self-approve without audit",
    ],
    successConditions: [
      "critique.hasProblems == false",
    ],
    failureConditions: [
      "critique finds critical contradictions (triggers LOOPBACK to Phase 3)",
      "critique finds missing subtasks/flaws (triggers LOOPBACK to Phase 2)",
    ],
    nextPhase: 8,
  },
  8: {
    phaseId: 8,
    phaseKey: "verification",
    name: "Verification",
    requiredInputs: ["coreExecutionResult", "simulationRecord", "critiqueRecord"],
    responsibleCore: "NIRNAYA",
    dependencies: [7],
    timeoutMs: 15000,
    retryPolicy: { maxRetries: 1, backoffMs: 500 },
    outputSchema: "VerificationMatrix",
    validationRules: [
      "Multi-dimensional consistency checked across facts, numbers, evidence, constraints",
      "Score must reflect honest verification bounds",
    ],
    successConditions: [
      "verification.status != 'CONTRADICTED'",
      "verification.status == 'VERIFIED' || verification.status == 'PARTIALLY_VERIFIED'",
    ],
    failureConditions: [
      "verification.status == 'CONTRADICTED'",
      "numerical / physical law constraint breach detected",
    ],
    nextPhase: 9,
  },
  9: {
    phaseId: 9,
    phaseKey: "safety",
    name: "Uncertainty + Safety Gate",
    requiredInputs: ["verificationMatrix", "simulationRecord", "evidenceBundle"],
    responsibleCore: "NIRNAYA",
    dependencies: [8],
    timeoutMs: 10000,
    retryPolicy: { maxRetries: 1, backoffMs: 200 },
    outputSchema: "UncertaintySafetyReport",
    validationRules: [
      "Confidence, Uncertainty, and Operational Risk must be evaluated independently",
      "Safety gate must enforce safety ladder: LOW_RISK / MEDIUM_RISK / HIGH_RISK / PROHIBITED",
    ],
    successConditions: [
      "safetyGate != 'PROHIBITED'",
    ],
    failureConditions: [
      "safetyGate == 'PROHIBITED'",
      "prohibited action or unverified direct physical actuation attempted",
    ],
    nextPhase: 10,
  },
  10: {
    phaseId: 10,
    phaseKey: "decision",
    name: "Decision Gate",
    requiredInputs: ["verificationMatrix", "uncertaintySafetyReport", "coreExecutionResult", "simulationRecord"],
    responsibleCore: "NIRNAYA",
    dependencies: [9],
    timeoutMs: 10000,
    retryPolicy: { maxRetries: 1, backoffMs: 200 },
    outputSchema: "ControlPlaneDecision",
    validationRules: [
      "Decision must state one of 7 canonical decision states",
      "High-risk actions require human approval token",
    ],
    successConditions: [
      "decision.state != 'BLOCK'",
    ],
    failureConditions: [
      "decision.state == 'BLOCK'",
      "unresolvable safety barrier",
    ],
    nextPhase: 11,
  },
  11: {
    phaseId: 11,
    phaseKey: "delivery",
    name: "Delivery / Execution",
    requiredInputs: ["controlPlaneDecision"],
    responsibleCore: "SETU",
    dependencies: [10],
    timeoutMs: 30000,
    retryPolicy: { maxRetries: 2, backoffMs: 1000 },
    outputSchema: "DeliveryResult",
    validationRules: [
      "Separate informational answer from sandboxed tool execution and physical-control action",
      "Physical control actions strictly require prior safety verification & approval",
    ],
    successConditions: [
      "deliveryResult.delivered == true",
    ],
    failureConditions: [
      "execution sandbox failure or permission rejection",
      "unauthorized direct physical call",
    ],
    nextPhase: 12,
  },
  12: {
    phaseId: 12,
    phaseKey: "learning",
    name: "Learning, Testing & Regression",
    requiredInputs: ["controlPlaneTaskRecord"],
    responsibleCore: "OUTER_CONTROL_PLANE",
    dependencies: [11],
    timeoutMs: 15000,
    retryPolicy: { maxRetries: 1, backoffMs: 500 },
    outputSchema: "LearningTrace",
    validationRules: [
      "Produce a structured testable trace for replay and evaluation",
      "Any failure or recovery during task automatically generates a regression test entry",
    ],
    successConditions: [
      "learningTrace.testableTraceId is non-empty",
    ],
    failureConditions: [
      "trace recording failed",
    ],
    nextPhase: null, // Terminal phase
  },
};

export function getContract(phaseId: PhaseId): PhaseContract {
  const c = PHASE_CONTRACTS[phaseId];
  if (!c) throw new Error(`Unknown Phase ID: ${phaseId}`);
  return c;
}
