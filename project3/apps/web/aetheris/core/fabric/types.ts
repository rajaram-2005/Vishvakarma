/**
 * AETHERIS — Master Network & Fabric Type Definitions
 *
 * Single Source of Truth for:
 * - Intelligence Graph & Semantic Edges
 * - Event Fabric
 * - State Fabric
 * - Evidence Fabric
 * - Memory Fabric
 * - Model Fabric
 * - Tool Fabric
 * - Safety Fabric
 * - World Model & Counterfactual Scenarios
 */
import type { PhaseId } from "../controlplane/types";

export type SemanticEdgeType =
  | "DEPENDS_ON"
  | "USES"
  | "GENERATED_BY"
  | "VERIFIED_BY"
  | "SUPPORTED_BY"
  | "CONTRADICTED_BY"
  | "PREDICTS"
  | "OBSERVES"
  | "CONTROLS"
  | "CONNECTED_TO"
  | "DERIVED_FROM"
  | "REQUIRES"
  | "BLOCKED_BY"
  | "TRIGGERS"
  | "LEARNED_FROM";

export type NetworkNodeType =
  | "MISSION"
  | "CORE"
  | "AGENT"
  | "MODEL"
  | "TOOL"
  | "ASSET"
  | "SENSOR"
  | "MEMORY"
  | "SIMULATION"
  | "EVIDENCE"
  | "DECISION"
  | "GATE";

export interface NetworkNode {
  id: string;
  type: NetworkNodeType;
  label: string;
  sublabel?: string;
  status: "idle" | "active" | "verified" | "warning" | "critical" | "blocked" | "archived";
  metadata: Record<string, unknown>;
  x?: number;
  y?: number;
  cluster?: string;
}

export interface NetworkEdge {
  id: string;
  source: string; // Source Node ID
  target: string; // Target Node ID
  type: SemanticEdgeType;
  label?: string;
  weight?: number; // 0..1
  active?: boolean;
  status?: "normal" | "verified" | "contradicted" | "blocked" | "pulsing";
}

export type EventCategory =
  | "mission"
  | "phase"
  | "core"
  | "agent"
  | "telemetry"
  | "anomaly"
  | "memory"
  | "model"
  | "tool"
  | "simulation"
  | "critique"
  | "verification"
  | "uncertainty"
  | "safety"
  | "approval"
  | "decision"
  | "execution"
  | "regression";

export type EventType =
  | "mission.created"
  | "mission.updated"
  | "phase.started"
  | "phase.completed"
  | "phase.failed"
  | "phase.blocked"
  | "phase.loopback"
  | "core.started"
  | "core.observed"
  | "core.completed"
  | "core.failed"
  | "agent.spawned"
  | "agent.started"
  | "agent.completed"
  | "agent.archived"
  | "telemetry.received"
  | "anomaly.detected"
  | "memory.retrieved"
  | "memory.created"
  | "model.selected"
  | "model.failed"
  | "tool.requested"
  | "tool.completed"
  | "tool.failed"
  | "simulation.started"
  | "simulation.completed"
  | "critique.started"
  | "critique.failed"
  | "verification.started"
  | "verification.passed"
  | "verification.failed"
  | "uncertainty.changed"
  | "approval.required"
  | "approval.granted"
  | "approval.denied"
  | "decision.created"
  | "execution.started"
  | "execution.completed"
  | "execution.blocked"
  | "regression.created"
  | "regression.failed"
  | "regression.passed";

export type MotionPriority =
  | "P0" // Safety
  | "P1" // Critical anomaly
  | "P2" // Agent execution
  | "P3" // Phase transition
  | "P4" // Data update
  | "P5" // Navigation
  | "P6"; // Decorative

export interface AetherisEvent {
  id: string;
  type: EventType;
  category: EventCategory;
  timestamp: number;
  priority: MotionPriority;
  sourceId: string;
  targetId?: string;
  payload: Record<string, unknown>;
  visualAction?: {
    motionType: "energy_stream" | "signal_wave" | "materialize" | "verification_pulse" | "barrier_close" | "data_particle";
    fromNodeId?: string;
    toNodeId?: string;
    color?: string;
  };
}

export type ValidationState = "OBSERVED" | "PREDICTED" | "SIMULATED" | "VERIFIED";

export interface CounterfactualScenario {
  id: "A" | "B" | "C" | "D";
  name: string;
  action: string;
  deratePct: number;
  prediction: {
    vibration_mms: number;
    temperature_K: number;
    power_kW: number;
    health_score: number;
    risk_level: "low" | "medium" | "high" | "critical";
  };
  confidence: number;
  uncertainty: "low" | "medium" | "high";
  operationalRisk: "low" | "medium" | "high";
  energyImpactPct: number;
  equipmentLifeImpactYears: number;
  validationState: ValidationState;
  trajectory: Array<{ tMin: number; vib: number; tempK: number; powerKW: number }>;
}

export interface CausalEvent {
  step: number;
  title: string;
  cause: string;
  effect: string;
  severity: "info" | "warn" | "critical";
  assetComponent: string;
  metric: string;
  observedValue: string;
}

export interface AetherisState {
  mission: {
    id: string;
    title: string;
    objective: string;
    status: "idle" | "running" | "verified" | "completed" | "blocked";
    progressPct: number;
    activeContextTab: "MISSION" | "ASSET" | "INCIDENT" | "SIMULATION" | "AGENT" | "MODEL";
  };
  phase: {
    current: PhaseId;
    name: string;
    state: "QUEUED" | "ACTIVE" | "WAITING" | "COMPLETED" | "FAILED" | "BLOCKED" | "SKIPPED_BY_POLICY" | "RETRYING";
    gateVerdict: "PASS" | "REVIEW" | "FAIL" | "WAIT" | "BLOCKED" | "NOT_REQUIRED";
    gateReason: string;
    history: Array<{ phaseId: PhaseId; name: string; verdict: string; durationMs: number }>;
  };
  assets: {
    selectedAssetId: string;
    focusedComponent: string | null;
    components: Array<{
      id: string;
      name: string;
      category: "tower" | "nacelle" | "rotor" | "gearbox" | "bearings" | "generator" | "inverter";
      health: number; // 0..1
      status: "nominal" | "watch" | "warning" | "critical";
      temperature_K: number;
      vibration_mms: number;
      sensors: string[];
    }>;
  };
  telemetry: {
    timestamp: number;
    streamActive: boolean;
    channels: Record<string, { value: number; unit: string; min: number; max: number; status: "ok" | "warn" | "critical" }>;
    historySparkline: number[];
  };
  agents: Array<{
    id: string;
    name: string;
    core: string;
    role: string;
    status: "IDLE" | "SPAWNING" | "WORKING" | "WAITING" | "BLOCKED" | "VERIFYING" | "COMPLETED" | "ARCHIVED";
    permissions: string[];
    confidence: number;
    runtimeMs: number;
  }>;
  cores: Record<string, { id: string; role: string; status: "active" | "idle" | "degraded"; loadPct: number }>;
  models: Array<{ name: string; provider: string; tier: string; active: boolean; latencyMs: number; errorRate: number }>;
  tools: Array<{ id: string; name: string; sandbox: "isolated" | "safe_read" | "guarded_write"; status: "idle" | "running" | "completed" }>;
  memory: Array<{
    id: string;
    type: "working" | "episodic" | "semantic" | "procedural" | "asset";
    title: string;
    content: string;
    source: string;
    verified: boolean;
    confidence: number;
    assetScope: string;
    createdAt: number;
  }>;
  simulations: {
    activeScenario: "A" | "B" | "C" | "D";
    scenarios: CounterfactualScenario[];
    causalTimeline: CausalEvent[];
    timelineScrubIndex: number;
  };
  evidence: Array<{
    id: string;
    claim: string;
    source: string;
    category: string;
    quality: number;
    verified: boolean;
    provenance: string;
  }>;
  decisions: {
    state: "RECOMMEND" | "EXECUTE_WITH_APPROVAL" | "EXECUTE" | "ABSTAIN" | "REQUEST_DATA" | "ESCALATE" | "BLOCK";
    summary: string;
    reasoning: string[];
    proposedActions: Array<{ target: string; action: string; risk: string; parameters: Record<string, unknown> }>;
    approvalRequired: boolean;
    approvalToken?: string;
  };
  policies: {
    autonomyLevel: "L0" | "L1" | "L2" | "L3" | "L4" | "L5";
    safetyInterlocksIntact: boolean;
    prohibitedActions: string[];
  };
  approvals: {
    pendingToken?: string;
    actionPending?: string;
    approvedAt?: number;
    approvedBy?: string;
  };
  uncertainty: {
    confidence: number; // 0..100
    epistemicUncertainty: "low" | "medium" | "high";
    dataQuality: number; // 0..100
    oodRisk: "low" | "medium" | "high";
    modelAgreementPct: number;
    evidenceCoveragePct: number;
  };
  audit: {
    totalEvents: number;
    lastCheckedAt: number;
    systemHealth: "READY" | "DEGRADED" | "BLOCKED";
  };
}
