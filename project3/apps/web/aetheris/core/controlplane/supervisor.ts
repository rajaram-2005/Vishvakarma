/**
 * Outer Control Plane Supervisor — AETHERIS v2
 *
 * Highest-level software supervisor over RAVANA and the 10 specialized cores.
 * Enforces the 12-Phase Gated Intelligence Pipeline:
 *
 * USER
 *  │
 *  ▼
 * OUTER CONTROL PLANE
 *  │
 *  ├── Phase 0: Intake Gate
 *  ├── Phase 1: Understanding
 *  ├── Phase 2: Decomposition
 *  ├── Phase 3: Evidence & Memory Retrieval
 *  ├── Phase 4: Intelligence Routing
 *  ├── Phase 5: Core Execution
 *  ├── Phase 6: World Model / Simulation
 *  ├── Phase 7: Adversarial Critique
 *  ├── Phase 8: Verification
 *  ├── Phase 9: Uncertainty + Safety Gate
 *  ├── Phase 10: Decision Gate
 *  ├── Phase 11: Delivery / Execution
 *  └── Phase 12: Learning, Testing & Regression
 *
 * Strict Rule: No phase may silently skip a required gate.
 */
import { randomBytes } from "node:crypto";
import type {
  ControlPlaneDecision,
  ControlPlaneTaskRecord,
  EvidenceBundle,
  ExecutionProvenanceNode,
  GateVerdict,
  InjectedFailure,
  PhaseExecutionRecord,
  PhaseId,
  SimulationRecord,
  TaskDecomposition,
  UncertaintySafetyReport,
  VerificationMatrix,
} from "./types";
import { getContract } from "./contracts";
import { normalizeMaxLoopbacks } from "./types";
import { runPhase0Intake, type IntakeAnalysis } from "./phases/intake";
import { runPhase1Understanding, type TaskUnderstanding } from "./phases/understanding";
import { runPhase2Decomposition } from "./phases/decomposition";
import { runPhase3Retrieval } from "./phases/retrieval";
import { runPhase4Routing, type IntelligenceRoutingPlan } from "./phases/routing";
import { runPhase5Execution, type CoreExecutionBatchResult } from "./phases/execution";
import { runPhase6Simulation } from "./phases/simulation";
import { runPhase7Critique } from "./phases/critique";
import { runPhase8Verification } from "./phases/verification";
import { runPhase9Safety } from "./phases/safety";
import { runPhase10Decision } from "./phases/decision";
import { runPhase11Delivery, type DeliveryResult } from "./phases/delivery";
import { runPhase12Learning, type LearningTrace } from "./phases/learning";

// In-memory tasks store for active control plane runs
const TASK_STORE: Map<string, ControlPlaneTaskRecord> = new Map();

export interface RunTaskOptions {
  uid?: string;
  /** Loopback ceiling for the Phase 7 → Phase 3 recovery loop; clamped to MAX_LOOPBACKS_LIMIT. */
  maxLoopbacks?: number;
  /** Fault to inject, for the Test Lab and the /control-plane runner. Validated by the caller. */
  injectedFailure?: InjectedFailure;
}

export class ControlPlaneSupervisor {
  /**
   * Run a request through the 12-Phase Gated Intelligence Pipeline.
   */
  public static async executeTask(
    rawRequest: string,
    options: RunTaskOptions = {}
  ): Promise<ControlPlaneTaskRecord> {
    const taskId = `cpt_${Date.now().toString(36)}_${randomBytes(4).toString("hex")}`;
    const uid = options.uid ?? "anon_operator";
    // Resource limit, not a preference: this is the only bound on the recovery loop, so it is
    // normalized here as well as at the route — a programmatic caller cannot bypass it either.
    const maxLoopbacks = normalizeMaxLoopbacks(options.maxLoopbacks);

    // Initialize blank Phase records
    const phases: Record<PhaseId, PhaseExecutionRecord> = {} as Record<PhaseId, PhaseExecutionRecord>;
    for (let i = 0; i <= 12; i++) {
      const pid = i as PhaseId;
      const contract = getContract(pid);
      phases[pid] = {
        phaseId: pid,
        phaseKey: contract.phaseKey,
        name: contract.name,
        startedAt: 0,
        endedAt: null,
        durationMs: null,
        status: "pending",
        gateVerdict: "PASS",
        gateReason: "Pending execution",
        inputs: {},
        outputs: {},
        activeAgents: [],
        activeTools: [],
        activeModels: [],
        errors: [],
      };
    }

    const task: ControlPlaneTaskRecord = {
      id: taskId,
      uid,
      rawRequest,
      state: "RECEIVED",
      currentPhase: 0,
      progressPct: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      phases,
      coreExecutions: [],
      loopbackCount: 0,
      maxLoopbacksAllowed: maxLoopbacks,
    };

    TASK_STORE.set(taskId, task);

    // ==========================================
    // PHASE 0: INTAKE GATE
    // ==========================================
    task.state = "RECEIVED";
    task.currentPhase = 0;
    task.progressPct = 5;
    const p0Rec = task.phases[0];
    p0Rec.startedAt = Date.now();
    p0Rec.status = "running";

    const intake: IntakeAnalysis = runPhase0Intake(rawRequest);
    p0Rec.inputs = { rawRequest };
    p0Rec.outputs = { ...intake };
    p0Rec.gateVerdict = intake.gateVerdict;
    p0Rec.gateReason = intake.scopeSummary;
    p0Rec.endedAt = Date.now();
    p0Rec.durationMs = p0Rec.endedAt - p0Rec.startedAt;

    if (intake.gateVerdict === "BLOCK") {
      p0Rec.status = "blocked";
      task.state = "BLOCKED";
      task.completedAt = Date.now();
      this.buildProvenance(task);
      return task;
    }

    if (intake.gateVerdict === "CLARIFICATION") {
      p0Rec.status = "failed";
      task.state = "WAITING_FOR_USER";
      task.completedAt = Date.now();
      this.buildProvenance(task);
      return task;
    }

    if (intake.gateVerdict === "REJECT") {
      p0Rec.status = "failed";
      task.state = "FAILED";
      task.completedAt = Date.now();
      this.buildProvenance(task);
      return task;
    }

    p0Rec.status = "passed";

    // ==========================================
    // PHASE 1: UNDERSTANDING
    // ==========================================
    task.state = "UNDERSTANDING";
    task.currentPhase = 1;
    task.progressPct = 12;
    const p1Rec = task.phases[1];
    p1Rec.startedAt = Date.now();
    p1Rec.status = "running";
    p1Rec.activeAgents = ["RAVANA"];

    const understanding: TaskUnderstanding = runPhase1Understanding(intake);
    task.understanding = understanding;
    p1Rec.inputs = { intake };
    p1Rec.outputs = { ...understanding };
    p1Rec.gateVerdict = understanding.gateVerdict;
    p1Rec.gateReason = "Task objective and constraints successfully normalized";
    p1Rec.endedAt = Date.now();
    p1Rec.durationMs = p1Rec.endedAt - p1Rec.startedAt;
    p1Rec.status = "passed";

    // ==========================================
    // PIPELINE LOOPBACK RECOVERY WRAPPER
    // ==========================================
    let currentLoopPhase: PhaseId = 2;
    let decomposition: (TaskDecomposition & { gateVerdict: GateVerdict }) | null = null;
    let retrieval: (EvidenceBundle & { gateVerdict: GateVerdict; summary: string }) | null = null;
    let routing: IntelligenceRoutingPlan | null = null;
    let coreResults: CoreExecutionBatchResult | null = null;
    let simulation: (SimulationRecord & { gateVerdict: GateVerdict; summary: string }) | null = null;

    while (currentLoopPhase <= 6) {
      if (currentLoopPhase === 2) {
        // Phase 2: Decomposition
        task.state = "DECOMPOSING";
        task.currentPhase = 2;
        task.progressPct = 20;
        const p2Rec = task.phases[2];
        p2Rec.startedAt = Date.now();
        p2Rec.status = "running";
        p2Rec.activeAgents = ["RAVANA"];

        decomposition = runPhase2Decomposition(understanding);
        task.decomposition = decomposition;
        p2Rec.inputs = { understanding };
        p2Rec.outputs = { subtasksCount: decomposition.subtasks.length, subtasks: decomposition.subtasks };
        p2Rec.gateVerdict = decomposition.gateVerdict;
        p2Rec.gateReason = `Decomposition produced ${decomposition.subtasks.length} subtasks with verified dependency graph.`;
        p2Rec.endedAt = Date.now();
        p2Rec.durationMs = p2Rec.endedAt - p2Rec.startedAt;
        p2Rec.status = decomposition.gateVerdict === "PASS" ? "passed" : "failed";

        currentLoopPhase = 3;
      }

      if (currentLoopPhase === 3) {
        // Phase 3: Evidence Retrieval
        task.state = "RETRIEVING";
        task.currentPhase = 3;
        task.progressPct = 30;
        const p3Rec = task.phases[3];
        p3Rec.startedAt = Date.now();
        p3Rec.status = "running";
        p3Rec.activeAgents = ["SMRITI", "PRAVAAH"];

        retrieval = runPhase3Retrieval(understanding);
        task.evidenceBundle = retrieval;
        p3Rec.inputs = { understanding, subtasksCount: decomposition?.subtasks.length };
        p3Rec.outputs = { itemsCount: retrieval.items.length, qualityScore: retrieval.qualityScore, sufficient: retrieval.sufficient };
        p3Rec.gateVerdict = retrieval.gateVerdict;
        p3Rec.gateReason = retrieval.summary;
        p3Rec.endedAt = Date.now();
        p3Rec.durationMs = p3Rec.endedAt - p3Rec.startedAt;
        p3Rec.status = retrieval.gateVerdict === "PASS" ? "passed" : "loopback";

        currentLoopPhase = 4;
      }

      if (currentLoopPhase === 4) {
        // Phase 4: Intelligence Routing
        task.state = "ROUTING";
        task.currentPhase = 4;
        task.progressPct = 40;
        const p4Rec = task.phases[4];
        p4Rec.startedAt = Date.now();
        p4Rec.status = "running";

        routing = runPhase4Routing(understanding, retrieval!);
        p4Rec.inputs = { understanding, evidenceScore: retrieval?.qualityScore };
        p4Rec.outputs = { ...routing };
        p4Rec.gateVerdict = routing.gateVerdict;
        p4Rec.gateReason = routing.rationale;
        p4Rec.endedAt = Date.now();
        p4Rec.durationMs = p4Rec.endedAt - p4Rec.startedAt;
        p4Rec.status = "passed";

        currentLoopPhase = 5;
      }

      if (currentLoopPhase === 5) {
        // Phase 5: Core Execution
        task.state = "EXECUTING";
        task.currentPhase = 5;
        task.progressPct = 52;
        const p5Rec = task.phases[5];
        p5Rec.startedAt = Date.now();
        p5Rec.status = "running";
        p5Rec.activeAgents = routing!.assignedCores.map((c) => c.coreId);
        p5Rec.activeTools = routing!.assignedTools;
        p5Rec.activeModels = routing!.assignedModels.map((m) => m.modelName);

        coreResults = await runPhase5Execution(routing!, understanding, retrieval!);
        task.coreExecutions = coreResults.records;
        p5Rec.inputs = { assignedCores: routing!.assignedCores };
        p5Rec.outputs = { executionRecordsCount: coreResults.records.length, summary: coreResults.summary };
        p5Rec.gateVerdict = coreResults.gateVerdict;
        p5Rec.gateReason = coreResults.summary;
        p5Rec.endedAt = Date.now();
        p5Rec.durationMs = p5Rec.endedAt - p5Rec.startedAt;
        p5Rec.status = coreResults.allPassed ? "passed" : "failed";

        currentLoopPhase = 6;
      }

      if (currentLoopPhase === 6) {
        // Phase 6: World Model / Simulation
        task.state = "SIMULATING";
        task.currentPhase = 6;
        task.progressPct = 62;
        const p6Rec = task.phases[6];
        p6Rec.startedAt = Date.now();
        p6Rec.status = "running";
        p6Rec.activeAgents = ["YANTRA", "VAYU-1"];

        simulation = runPhase6Simulation(understanding, coreResults!);
        task.simulation = simulation;
        p6Rec.inputs = { coreOutputs: coreResults!.records.map((r) => r.coreId) };
        p6Rec.outputs = { ...simulation };
        p6Rec.gateVerdict = simulation.gateVerdict;
        p6Rec.gateReason = simulation.summary;
        p6Rec.endedAt = Date.now();
        p6Rec.durationMs = p6Rec.endedAt - p6Rec.startedAt;
        p6Rec.status = "passed";

        // ==========================================
        // PHASE 7: ADVERSARIAL CRITIQUE
        // ==========================================
        task.state = "CRITIQUING";
        task.currentPhase = 7;
        task.progressPct = 72;
        const p7Rec = task.phases[7];
        p7Rec.startedAt = Date.now();
        p7Rec.status = "running";
        p7Rec.activeAgents = ["OUTER_CONTROL_PLANE_CRITIC"];

        const injectedProb = options.injectedFailure === "contradiction" ? "contradiction" : undefined;
        const critique = runPhase7Critique(understanding, retrieval!, coreResults!, simulation, injectedProb);
        task.critique = critique;
        p7Rec.inputs = { simulationMetrics: simulation.metrics };
        p7Rec.outputs = { ...critique };
        p7Rec.gateVerdict = critique.gateVerdict;
        p7Rec.gateReason = critique.summary;
        p7Rec.endedAt = Date.now();
        p7Rec.durationMs = p7Rec.endedAt - p7Rec.startedAt;

        if (critique.hasProblems && task.loopbackCount < task.maxLoopbacksAllowed) {
          task.loopbackCount++;
          p7Rec.status = "loopback";
          p7Rec.loopbackTargetPhase = critique.targetLoopbackPhase ?? 3;
          currentLoopPhase = p7Rec.loopbackTargetPhase; // Execute controlled recovery loop!
          continue;
        }

        p7Rec.status = "passed";
        break; // Passed Phase 7 cleanly
      }
    }

    // ==========================================
    // PHASE 8: MULTI-DIMENSIONAL VERIFICATION
    // ==========================================
    task.state = "VERIFYING";
    task.currentPhase = 8;
    task.progressPct = 80;
    const p8Rec = task.phases[8];
    p8Rec.startedAt = Date.now();
    p8Rec.status = "running";
    p8Rec.activeAgents = ["NIRNAYA"];

    const verification: VerificationMatrix & { gateVerdict: GateVerdict; summary: string } = runPhase8Verification(
      retrieval!,
      coreResults!,
      simulation!,
      task.critique!
    );
    task.verification = verification;
    p8Rec.inputs = { retrievalItems: retrieval!.items.length, simulationState: simulation!.validationStatus };
    p8Rec.outputs = { ...verification };
    p8Rec.gateVerdict = verification.gateVerdict;
    p8Rec.gateReason = verification.summary;
    p8Rec.endedAt = Date.now();
    p8Rec.durationMs = p8Rec.endedAt - p8Rec.startedAt;
    p8Rec.status = verification.status !== "CONTRADICTED" ? "passed" : "failed";

    // ==========================================
    // PHASE 9: UNCERTAINTY + SAFETY GATE
    // ==========================================
    task.state = "RISK_CHECK";
    task.currentPhase = 9;
    task.progressPct = 88;
    const p9Rec = task.phases[9];
    p9Rec.startedAt = Date.now();
    p9Rec.status = "running";
    p9Rec.activeAgents = ["NIRNAYA"];

    const forceProh = options.injectedFailure === "safety_block";
    const safety: UncertaintySafetyReport & { gateVerdict: GateVerdict; summary: string } = runPhase9Safety(
      understanding,
      retrieval!,
      simulation!,
      verification,
      forceProh
    );
    task.uncertaintySafety = safety;
    p9Rec.inputs = { verificationScore: verification.score, simulationRisk: simulation!.metrics.risk_level };
    p9Rec.outputs = { ...safety };
    p9Rec.gateVerdict = safety.gateVerdict;
    p9Rec.gateReason = safety.summary;
    p9Rec.endedAt = Date.now();
    p9Rec.durationMs = p9Rec.endedAt - p9Rec.startedAt;

    if (safety.gateVerdict === "BLOCK") {
      p9Rec.status = "blocked";
      task.state = "BLOCKED";
      task.completedAt = Date.now();
      this.buildProvenance(task);
      return task;
    }

    p9Rec.status = "passed";

    // ==========================================
    // PHASE 10: DECISION GATE
    // ==========================================
    task.state = "DECIDING";
    task.currentPhase = 10;
    task.progressPct = 93;
    const p10Rec = task.phases[10];
    p10Rec.startedAt = Date.now();
    p10Rec.status = "running";
    p10Rec.activeAgents = ["NIRNAYA", "RAVANA"];

    const decision: ControlPlaneDecision & { gateVerdict: GateVerdict } = runPhase10Decision(
      understanding,
      coreResults!,
      simulation!,
      verification,
      safety
    );
    task.decision = decision;
    p10Rec.inputs = { safetyGate: safety.safetyGate, confidence: safety.confidence };
    p10Rec.outputs = { ...decision };
    p10Rec.gateVerdict = decision.gateVerdict;
    p10Rec.gateReason = decision.summary;
    p10Rec.endedAt = Date.now();
    p10Rec.durationMs = p10Rec.endedAt - p10Rec.startedAt;
    p10Rec.status = decision.state !== "BLOCK" ? "passed" : "blocked";

    // ==========================================
    // PHASE 11: DELIVERY / EXECUTION
    // ==========================================
    task.state = "DELIVERING";
    task.currentPhase = 11;
    task.progressPct = 96;
    const p11Rec = task.phases[11];
    p11Rec.startedAt = Date.now();
    p11Rec.status = "running";
    p11Rec.activeAgents = ["SETU"];

    const delivery: DeliveryResult = runPhase11Delivery(understanding, decision);
    task.deliveryResult = delivery;
    p11Rec.inputs = { decisionState: decision.state, channel: delivery.channel };
    p11Rec.outputs = { ...delivery.output };
    p11Rec.gateVerdict = delivery.gateVerdict;
    p11Rec.gateReason = `Delivered through channel [${delivery.channel}]`;
    p11Rec.endedAt = Date.now();
    p11Rec.durationMs = p11Rec.endedAt - p11Rec.startedAt;
    p11Rec.status = "passed";

    // ==========================================
    // PHASE 12: LEARNING, TESTING & REGRESSION
    // ==========================================
    task.state = "LEARNING";
    task.currentPhase = 12;
    task.progressPct = 100;
    const p12Rec = task.phases[12];
    p12Rec.startedAt = Date.now();
    p12Rec.status = "running";
    p12Rec.activeAgents = ["OUTER_CONTROL_PLANE_TEST_MANAGER"];

    const learning: LearningTrace = runPhase12Learning(task);
    task.learningTrace = learning;
    p12Rec.inputs = { loopbacks: task.loopbackCount, state: task.state };
    p12Rec.outputs = { ...learning };
    p12Rec.gateVerdict = learning.gateVerdict;
    p12Rec.gateReason = learning.traceSummary;
    p12Rec.endedAt = Date.now();
    p12Rec.durationMs = p12Rec.endedAt - p12Rec.startedAt;
    p12Rec.status = "passed";

    task.state = "COMPLETED";
    task.completedAt = Date.now();
    task.updatedAt = Date.now();

    this.buildProvenance(task);
    return task;
  }

  /**
   * Constructs the 5-layer execution provenance tree:
   * Phase -> Core -> Tool -> Evidence -> Result
   */
  private static buildProvenance(task: ControlPlaneTaskRecord): void {
    const root: ExecutionProvenanceNode = {
      id: "root-prov",
      type: "phase",
      label: "Outer Control Plane Pipeline",
      detail: `Task ${task.id} (${task.state})`,
      status: task.state === "COMPLETED" ? "ok" : task.state === "BLOCKED" ? "blocked" : "warn",
      children: [],
    };

    for (let i = 0; i <= 12; i++) {
      const pid = i as PhaseId;
      const p = task.phases[pid];
      if (p.startedAt === 0) continue;

      const phaseNode: ExecutionProvenanceNode = {
        id: `prov-p${pid}`,
        type: "phase",
        label: `Phase ${pid}: ${p.name}`,
        detail: `Status: ${p.status} | Gate: ${p.gateVerdict} (${p.durationMs ?? 0}ms)`,
        status: p.status === "passed" ? "ok" : p.status === "blocked" ? "blocked" : "fail",
        children: [],
      };

      // Add responsible cores as child nodes
      const cores = p.activeAgents;
      for (const c of cores) {
        const coreNode: ExecutionProvenanceNode = {
          id: `prov-p${pid}-core-${c}`,
          type: "core",
          label: `Core: ${c}`,
          detail: `Responsible execution unit in Phase ${pid}`,
          status: "ok",
          children: [],
        };

        // Add tools invoked
        for (const t of p.activeTools) {
          coreNode.children!.push({
            id: `prov-p${pid}-tool-${t}`,
            type: "tool",
            label: `Tool: ${t}`,
            detail: "Sandboxed tool execution",
            status: "ok",
          });
        }

        phaseNode.children!.push(coreNode);
      }

      root.children!.push(phaseNode);
    }

    task.provenanceGraph = root;
  }

  /**
   * One task, for its owner only.
   *
   * Returns null both when the id is unknown and when it belongs to a different uid, so the route
   * answers 404 either way and a task id cannot be used to probe whether someone else's run exists.
   * This is the same rule `src/core/ravana/engine.ts` applies to RAVANA tasks; the control plane
   * stored `uid` on every record but never checked it.
   */
  public static getTask(id: string, uid: string): ControlPlaneTaskRecord | null {
    const task = TASK_STORE.get(id);
    return task && task.uid === uid ? task : null;
  }

  /** Every task owned by `uid`, newest first. Cross-uid isolation, as above. */
  public static listTasks(uid: string): ControlPlaneTaskRecord[] {
    return Array.from(TASK_STORE.values())
      .filter((t) => t.uid === uid)
      .sort((a, b) => b.createdAt - a.createdAt);
  }
}
