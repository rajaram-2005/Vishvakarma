/**
 * Phase 2 — Decomposition
 *
 * RAVANA decomposes the task into structured subtasks:
 * TASK-001: Retrieve telemetry
 * TASK-002: Analyze vibration
 * TASK-003: Inspect historical events
 * TASK-004: Map asset in digital twin
 * TASK-005: Run diagnostics
 * TASK-006: Simulate possible causes
 * TASK-007: Estimate uncertainty
 * TASK-008: Verify evidence
 * TASK-009: Generate recommendation
 *
 * Gate: Are dependencies identified? Are required cores/tools identified? Is plan complete?
 */
import type { GateVerdict, SubtaskDefinition, TaskDecomposition } from "../types";
import type { TaskUnderstanding } from "./understanding";

export function runPhase2Decomposition(understanding: TaskUnderstanding): TaskDecomposition & { gateVerdict: GateVerdict } {
  const subtasks: SubtaskDefinition[] = [];
  const req = understanding.objective.toLowerCase();

  // Subtask 1: Retrieve context and evidence
  subtasks.push({
    id: "TASK-001",
    name: "Retrieve Context & Evidence",
    objective: "Query SMRITI memory fabric, asset registry, and relevant history.",
    requiredCores: ["SMRITI"],
    requiredTools: ["memory_search", "asset_lookup"],
    dependencies: [],
    status: "pending",
  });

  // If analytical or telemetry involved
  if (understanding.requiredEvidence.includes("telemetry") || /vibration|telemetry|fft|gearbox|bearing/i.test(req)) {
    subtasks.push({
      id: "TASK-002",
      name: "Analyze Telemetry & Spectra",
      objective: "Extract vibration signal, calculate FFT spectrum, match bearing fault harmonics.",
      requiredCores: ["PRAVAAH", "NIRIKSHAN"],
      requiredTools: ["fft_analyzer", "threshold_evaluator"],
      dependencies: ["TASK-001"],
      status: "pending",
    });

    subtasks.push({
      id: "TASK-003",
      name: "Map Asset in Digital Twin",
      objective: "Read live state and bounds from YANTRA digital twin asset model.",
      requiredCores: ["YANTRA"],
      requiredTools: ["twin_query"],
      dependencies: ["TASK-001"],
      status: "pending",
    });
  }

  // Simulation subtask
  if (/simulat|what\s*if|derate|action|scenario|counterfactual/i.test(req) || understanding.risk !== "low") {
    subtasks.push({
      id: `TASK-00${subtasks.length + 1}`,
      name: "Run World Model Counterfactuals",
      objective: "Simulate candidate interventions (derate, shutdown, do nothing) and compute thermal/vibration trajectories.",
      requiredCores: ["YANTRA", "VAYU-1"],
      requiredTools: ["twin_simulator"],
      dependencies: subtasks.map((s) => s.id),
      status: "pending",
    });
  }

  // Verification & Decision Subtasks
  const prevIds = subtasks.map((s) => s.id);
  subtasks.push({
    id: `TASK-00${subtasks.length + 1}`,
    name: "Adversarial Critique & Verification",
    objective: "Subject findings to NIRNAYA multi-dimensional consistency check and independent critique.",
    requiredCores: ["NIRNAYA"],
    requiredTools: ["symbolic_verifier", "constraint_checker"],
    dependencies: prevIds,
    status: "pending",
  });

  subtasks.push({
    id: `TASK-00${subtasks.length + 1}`,
    name: "Decision & Structured Delivery",
    objective: "Formulate verified recommendation or guarded execution plan with safety bounds.",
    requiredCores: ["RAVANA", "SETU"],
    requiredTools: ["delivery_formatter"],
    dependencies: [subtasks[subtasks.length - 1].id],
    status: "pending",
  });

  // Validate dependency graph: ensure no cycles and every dependency refers to an existing subtask
  const ids = new Set(subtasks.map((s) => s.id));
  let dependencyGraphValid = true;

  for (const s of subtasks) {
    for (const dep of s.dependencies) {
      if (!ids.has(dep) || dep === s.id) {
        dependencyGraphValid = false;
        break;
      }
    }
  }

  return {
    subtasks,
    dependencyGraphValid,
    estimatedSteps: subtasks.length,
    gateVerdict: dependencyGraphValid && subtasks.length > 0 ? "PASS" : "FAIL",
  };
}
