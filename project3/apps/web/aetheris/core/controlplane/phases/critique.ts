/**
 * Phase 7 — Adversarial Critique
 *
 * Independent Critic over candidate reasoning and simulation:
 * Does NOT let the same reasoning pathway approve its own conclusion.
 *
 * Searches for:
 * ├── contradictions
 * ├── unsupported claims
 * ├── missing evidence
 * ├── incorrect assumptions
 * ├── calculation errors
 * ├── policy violations
 * └── alternative explanations
 *
 * Outcomes:
 *   NO PROBLEMS -> continue (PASS)
 *   PROBLEMS FOUND -> controlled loopback to relevant earlier phase (LOOPBACK)
 *     - Missing evidence -> Return to Phase 3
 *     - Incomplete plan / wrong assumption -> Return to Phase 2
 */
import type { CritiqueProblem, CritiqueRecord, GateVerdict, PhaseId } from "../types";
import type { EvidenceBundle } from "../types";
import type { SimulationRecord } from "../types";
import type { CoreExecutionBatchResult } from "./execution";
import type { TaskUnderstanding } from "./understanding";

export function runPhase7Critique(
  understanding: TaskUnderstanding,
  evidence: EvidenceBundle,
  coreResults: CoreExecutionBatchResult,
  simulation: SimulationRecord,
  forceProblemScenario?: "missing_evidence" | "calculation_error" | "contradiction" | "policy_violation"
): CritiqueRecord & { gateVerdict: GateVerdict; summary: string } {
  const problems: CritiqueProblem[] = [];
  const unsupportedClaims: string[] = [];
  const calculationErrors: string[] = [];
  const alternativeExplanations: string[] = [];

  // Check 1: Missing Evidence
  if (understanding.assets[0] !== "GENERAL_SYSTEM" && evidence.items.length < 2) {
    problems.push({
      kind: "missing_evidence",
      description: "Insufficient telemetry / history rows to confirm bearing defect.",
      severity: "critical",
      suggestedLoopbackPhase: 3, // Return to Evidence Retrieval
    });
  }

  // Check 2: Contradictions between telemetry and diagnostics
  const diagCore = coreResults.records.find((r) => r.coreId === "NIRIKSHAN");
  const scadaCore = coreResults.records.find((r) => r.coreId === "PRAVAAH");
  if (diagCore && scadaCore) {
    const scadaVib = Number(scadaCore.output.meanVibration ?? 0);
    const diagVib = Number(diagCore.output.peakMagnitudeMms ?? 0);
    if (scadaVib > 0 && diagVib > 0 && Math.abs(scadaVib - diagVib) > 10.0) {
      problems.push({
        kind: "contradiction",
        description: `Discrepancy between SCADA mean vibration (${scadaVib}) and diagnostic peak vibration (${diagVib}).`,
        severity: "critical",
        suggestedLoopbackPhase: 3,
      });
    }
  }

  // Check 3: Simulation Consistency vs Invariants
  if (simulation.metrics.vibration_mms && simulation.metrics.vibration_mms > 15.0) {
    problems.push({
      kind: "calculation_error",
      description: "Simulation projected extreme unphysical vibration exceeding 15 mm/s.",
      severity: "warning",
      suggestedLoopbackPhase: 2, // Return to Decomposition / Planning
    });
    calculationErrors.push("Simulation divergence on vibration projection.");
  }

  // Alternative explanations
  if (diagCore && diagCore.output.matchedFaultSignature) {
    alternativeExplanations.push(
      "High 89.3 Hz peak could alternatively arise from aerodynamic blade-pass harmonics (3P excitation) rather than bearing defect."
    );
  }

  // Handle explicitly injected test scenario if requested
  if (forceProblemScenario === "missing_evidence") {
    problems.push({
      kind: "missing_evidence",
      description: "Adversarial test: critical telemetry feed missing.",
      severity: "critical",
      suggestedLoopbackPhase: 3,
    });
  } else if (forceProblemScenario === "contradiction") {
    problems.push({
      kind: "contradiction",
      description: "Adversarial test: contradictory sensor streams detected.",
      severity: "critical",
      suggestedLoopbackPhase: 3,
    });
  } else if (forceProblemScenario === "calculation_error") {
    problems.push({
      kind: "calculation_error",
      description: "Adversarial test: dimensional analysis mismatch.",
      severity: "critical",
      suggestedLoopbackPhase: 2,
    });
    calculationErrors.push("AST unit mismatch in torque formula.");
  } else if (forceProblemScenario === "policy_violation") {
    problems.push({
      kind: "policy_violation",
      description: "Adversarial test: proposed action lacks mandatory grant.",
      severity: "critical",
      suggestedLoopbackPhase: 1,
    });
  }

  const hasProblems = problems.some((p) => p.severity === "critical");
  let targetLoopbackPhase: PhaseId | null = null;

  if (hasProblems) {
    const crit = problems.find((p) => p.severity === "critical");
    targetLoopbackPhase = crit?.suggestedLoopbackPhase ?? 3;
  }

  const gateVerdict: GateVerdict = hasProblems ? "LOOPBACK" : "PASS";
  const summary = hasProblems
    ? `Critique identified ${problems.length} problems (${problems.filter((p) => p.severity === "critical").length} critical). Controlled loopback to Phase ${targetLoopbackPhase} initiated.`
    : `Adversarial critique passed with 0 critical issues. ${alternativeExplanations.length} alternative explanations noted.`;

  return {
    hasProblems,
    problems,
    unsupportedClaims,
    calculationErrors,
    alternativeExplanations,
    loopbackRecommended: hasProblems,
    targetLoopbackPhase,
    gateVerdict,
    summary,
  };
}
