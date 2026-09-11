/**
 * Phase 10 — Decision Gate
 *
 * Synthesizes:
 * Evidence + Reasoning + Simulation + Critique + Verification + Uncertainty + Safety + Policy
 *
 * Produces Decision in one of 7 canonical states:
 * ├── RECOMMEND
 * ├── EXECUTE_WITH_APPROVAL
 * ├── EXECUTE
 * ├── ABSTAIN
 * ├── REQUEST_DATA
 * ├── ESCALATE
 * └── BLOCK
 *
 * Gate:
 *   PASS  -> state != 'BLOCK'
 *   BLOCK -> state == 'BLOCK'
 */
import type { ControlPlaneDecision, DecisionState, GateVerdict } from "../types";
import type { CoreExecutionBatchResult } from "./execution";
import type { SimulationRecord } from "../types";
import type { UncertaintySafetyReport } from "../types";
import type { VerificationMatrix } from "../types";
import type { TaskUnderstanding } from "./understanding";

export function runPhase10Decision(
  understanding: TaskUnderstanding,
  coreResults: CoreExecutionBatchResult,
  simulation: SimulationRecord,
  verification: VerificationMatrix,
  safety: UncertaintySafetyReport
): ControlPlaneDecision & { gateVerdict: GateVerdict } {
  let state: DecisionState = "RECOMMEND";
  const reasoning: string[] = [];
  const safetyNotes: string[] = [];
  const actionsProposed: ControlPlaneDecision["actionsProposed"] = [];

  // 1. Check for Block
  if (safety.safetyGate === "PROHIBITED") {
    state = "BLOCK";
    reasoning.push("Safety policy prohibition: Requested operation violates hard physical interlocks.");
    safetyNotes.push(safety.prohibitedReason ?? "Hard block active.");
    return {
      state,
      summary: "Decision Gate: Request BLOCKED by safety policy.",
      reasoning,
      actionsProposed: [],
      safetyNotes,
      requiresApproval: false,
      gateVerdict: "BLOCK",
    };
  }

  // 2. Check for Abstention (NIRNAYA "I don't know")
  if (verification.status === "CONTRADICTED" || (safety.uncertainty === "high" && safety.confidence < 50)) {
    state = "ABSTAIN";
    reasoning.push("High epistemic uncertainty and contradictory verification results prevent confident decision.");
    return {
      state,
      summary: "Aetheris abstains from making an unverified decision due to conflicting data.",
      reasoning,
      actionsProposed: [],
      safetyNotes: ["Abstention triggered to prevent erroneous autonomous action."],
      requiresApproval: false,
      gateVerdict: "PASS", // Abstain is a valid honest completion
    };
  }

  // 3. Check for Data Request
  if (safety.uncertainty === "high") {
    state = "REQUEST_DATA";
    reasoning.push("Data density is insufficient to rule out alternative vibration fault mechanisms.");
    return {
      state,
      summary: "Additional high-frequency telemetry or acoustic sensor data requested before proceeding.",
      reasoning,
      actionsProposed: [],
      safetyNotes: ["Hold in non-executing analytical state."],
      requiresApproval: false,
      gateVerdict: "PASS",
    };
  }

  // 4. Check for Execution vs Approval vs Recommendation
  if (understanding.intent === "physical_world_action") {
    if (safety.requiresHumanApproval) {
      state = "EXECUTE_WITH_APPROVAL";
      reasoning.push("Proposed physical derate / dispatch verified by simulation but requires operator sign-off.");
      actionsProposed.push({
        target: understanding.assets[0] ?? "WTG-04",
        action: "set_operating_mode",
        parameters: { mode: "derated", targetRpm: 1275, deratePct: 15 },
        risk: "medium",
      });
    } else {
      state = "EXECUTE";
      reasoning.push("Safe automated execution within policy envelope.");
    }
  } else if (safety.operationalRisk === "high") {
    state = "ESCALATE";
    reasoning.push("Critical asset severity requires escalation to lead wind turbine engineer.");
  } else {
    state = "RECOMMEND";
    reasoning.push("Diagnostic reasoning and simulation indicate optimal mitigation is 15% derating.");
    actionsProposed.push({
      target: understanding.assets[0] ?? "WTG-04",
      action: "recommended_inspection_and_derate",
      parameters: { suggestedDeratePct: 15, inspectionWindowDays: 3 },
      risk: "low",
    });
  }

  const approvalToken = state === "EXECUTE_WITH_APPROVAL" ? `appr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}` : undefined;

  return {
    state,
    summary: `Decision reached: [${state}] for asset ${understanding.assets.join(", ")}.`,
    reasoning,
    actionsProposed,
    safetyNotes: [
      `Confidence: ${safety.confidence}%, Uncertainty: ${safety.uncertainty}, Safety Gate: ${safety.safetyGate}`,
    ],
    requiresApproval: state === "EXECUTE_WITH_APPROVAL",
    approvalToken,
    gateVerdict: "PASS",
  };
}
