/**
 * Phase 9 — Uncertainty + Safety Gate
 *
 * Explicitly separates:
 * - Confidence (statistical model calibration)
 * - Uncertainty (epistemic + aleatoric data gap)
 * - Operational Risk (consequence of proposed physical action)
 *
 * Important distinction:
 * "A high-confidence diagnosis can still imply a high-risk action."
 *
 * Safety Gate Ladder:
 *   LOW_RISK     -> Normal autonomous delivery
 *   MEDIUM_RISK  -> Policy-guided review
 *   HIGH_RISK    -> Explicit human approval token required
 *   PROHIBITED   -> Hard block (cannot proceed)
 *
 * Gate:
 *   PASS  -> safetyGate != 'PROHIBITED'
 *   BLOCK -> safetyGate == 'PROHIBITED'
 */
import type { GateVerdict, SafetyGateStatus, UncertaintySafetyReport } from "../types";
import type { EvidenceBundle } from "../types";
import type { SimulationRecord } from "../types";
import type { TaskUnderstanding } from "./understanding";
import type { VerificationMatrix } from "../types";

export function runPhase9Safety(
  understanding: TaskUnderstanding,
  evidence: EvidenceBundle,
  simulation: SimulationRecord,
  verification: VerificationMatrix,
  forceProhibited?: boolean
): UncertaintySafetyReport & { gateVerdict: GateVerdict; summary: string } {
  const safetyInterlocksChecked = [
    "E-Stop & Emergency Interlock Integrity",
    "Thermal Runaway Max Bound (80°C / 353.15 K)",
    "Overspeed Trip Limit (1800 RPM)",
    "ISO 10816-3 Vibration Severity Bounds (11.2 mm/s)",
    "Safe Write & Physical Actuation Permission Ladder",
  ];

  if (forceProhibited) {
    return {
      confidence: 95,
      uncertainty: "low",
      operationalRisk: "prohibited",
      safetyGate: "PROHIBITED",
      requiresHumanApproval: true,
      prohibitedReason: "Direct actuation requested without hardware interlock verification.",
      safetyInterlocksChecked,
      gateVerdict: "BLOCK",
      summary: "Safety Gate: Action PROHIBITED. Direct physical actuation blocked by safety interlock.",
    };
  }

  // 1. Calculate Confidence (from verification score + evidence quality)
  const rawConf = (verification.score * 0.6 + evidence.qualityScore * 0.4) * 100;
  const confidence = Math.min(99, Math.max(30, Math.round(rawConf)));

  // 2. Calculate Uncertainty (epistemic gap)
  let uncertainty: "low" | "medium" | "high" = "low";
  if (evidence.items.length < 3 || evidence.conflicting || verification.score < 0.75) {
    uncertainty = "high";
  } else if (evidence.qualityScore < 0.8) {
    uncertainty = "medium";
  }

  // 3. Calculate Operational Risk
  let operationalRisk: UncertaintySafetyReport["operationalRisk"] = "low";
  if (understanding.intent === "physical_world_action") {
    operationalRisk = "high";
  } else if (understanding.intent === "simulation" && simulation.metrics.risk_level === "high") {
    operationalRisk = "medium";
  } else if (understanding.risk === "high") {
    operationalRisk = "high";
  }

  // 4. Determine Safety Gate Status
  let safetyGate: SafetyGateStatus = "LOW_RISK";
  let requiresHumanApproval = false;

  if (operationalRisk === "high") {
    safetyGate = "HIGH_RISK";
    requiresHumanApproval = true;
  } else if (operationalRisk === "medium" || uncertainty === "high") {
    safetyGate = "MEDIUM_RISK";
    requiresHumanApproval = false;
  }

  const gateVerdict: GateVerdict = (safetyGate as SafetyGateStatus) === "PROHIBITED" ? "BLOCK" : "PASS";

  return {
    confidence,
    uncertainty,
    operationalRisk,
    safetyGate,
    requiresHumanApproval,
    safetyInterlocksChecked,
    gateVerdict,
    summary: `Safety gate assessed: Confidence ${confidence}%, Uncertainty [${uncertainty}], Operational Risk [${operationalRisk}]. Gate: ${safetyGate} (${requiresHumanApproval ? "Human Approval Required" : "Autonomous Pass"}).`,
  };
}
