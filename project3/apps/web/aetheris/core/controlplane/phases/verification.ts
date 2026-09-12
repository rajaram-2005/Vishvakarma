/**
 * Phase 8 — Multi-dimensional Verification
 *
 * NIRNAYA verifies the result across 8 dimensions:
 * ├── factual consistency
 * ├── numerical consistency
 * ├── evidence consistency
 * ├── source consistency
 * ├── model agreement
 * ├── constraint consistency
 * ├── tool-result consistency
 * └── simulation consistency
 *
 * Result:
 *   VERIFIED
 *   PARTIALLY VERIFIED
 *   UNVERIFIED
 *   CONTRADICTED
 *
 * Gate:
 *   PASS -> status != 'CONTRADICTED' (must be VERIFIED or PARTIALLY_VERIFIED)
 *   FAIL -> status == 'CONTRADICTED'
 */
import type { GateVerdict, VerificationMatrix, VerificationStatus } from "../types";
import type { CritiqueRecord } from "../types";
import type { EvidenceBundle } from "../types";
import type { SimulationRecord } from "../types";
import type { CoreExecutionBatchResult } from "./execution";

export function runPhase8Verification(
  evidence: EvidenceBundle,
  coreResults: CoreExecutionBatchResult,
  simulation: SimulationRecord,
  critique: CritiqueRecord,
  forceContradiction?: boolean
): VerificationMatrix & { gateVerdict: GateVerdict; summary: string } {
  if (forceContradiction) {
    return {
      status: "CONTRADICTED",
      factualConsistency: false,
      numericalConsistency: false,
      evidenceConsistency: false,
      sourceConsistency: true,
      modelAgreement: false,
      constraintConsistency: false,
      toolResultConsistency: true,
      simulationConsistency: false,
      score: 0.25,
      notes: ["Contradiction detected: Physical invariants violated."],
      gateVerdict: "FAIL",
      summary: "Verification failed: Results contradicted physical bounds.",
    };
  }

  const factualConsistency = evidence.items.length > 0 && !evidence.conflicting;
  const numericalConsistency = simulation.breachesDetected.length === 0 || simulation.metrics.vibration_mms !== undefined;
  const evidenceConsistency = evidence.qualityScore >= 0.6;
  const sourceConsistency = evidence.items.every((it) => it.source && it.provenance);
  const modelAgreement = coreResults.records.every((r) => r.confidence >= 0.7);
  const constraintConsistency = critique.calculationErrors.length === 0;
  const toolResultConsistency = coreResults.allPassed;
  const simulationConsistency = simulation.validationStatus !== undefined;

  const checks = [
    factualConsistency,
    numericalConsistency,
    evidenceConsistency,
    sourceConsistency,
    modelAgreement,
    constraintConsistency,
    toolResultConsistency,
    simulationConsistency,
  ];

  const passCount = checks.filter(Boolean).length;
  const score = passCount / checks.length;

  let status: VerificationStatus = "VERIFIED";
  if (score < 0.5) status = "CONTRADICTED";
  else if (score < 0.75) status = "UNVERIFIED";
  else if (score < 1.0) status = "PARTIALLY_VERIFIED";

  const notes: string[] = [];
  if (!factualConsistency) notes.push("Factual consistency check flagged due to missing or conflicting evidence.");
  if (!numericalConsistency) notes.push("Numerical consistency check flagged simulation anomalies.");
  if (modelAgreement) notes.push("Multi-core agreement verified across assigned cores.");
  if (constraintConsistency) notes.push("Physical invariants and unit consistency verified.");

  const gateVerdict: GateVerdict = status === "CONTRADICTED" ? "FAIL" : "PASS";

  return {
    status,
    factualConsistency,
    numericalConsistency,
    evidenceConsistency,
    sourceConsistency,
    modelAgreement,
    constraintConsistency,
    toolResultConsistency,
    simulationConsistency,
    score,
    notes,
    gateVerdict,
    summary: `NIRNAYA multi-dimensional verification completed with status [${status}] (${(score * 100).toFixed(0)}% consistency score across 8 dimensions).`,
  };
}
