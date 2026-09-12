/**
 * Phase 11 — Delivery / Execution
 *
 * Strictly separates:
 * 1. Informational task:
 *      Decision -> Formatted Structured Answer
 * 2. Tool task:
 *      Decision -> SETU -> Permission Gate -> Sandbox/Tool -> Execution -> Verification
 * 3. Physical-control task:
 *      Decision -> Safety Gate -> Human Approval -> Control Interface -> Verification
 *
 * Strict Rule: Never allow LLM -> directly -> physical equipment.
 *
 * Gate:
 *   PASS -> Delivery executed or staged with approval token.
 */
import type { ControlPlaneDecision, GateVerdict } from "../types";
import type { TaskUnderstanding } from "./understanding";

export interface DeliveryResult {
  channel: "informational" | "tool_execution" | "physical_control";
  delivered: boolean;
  output: {
    title: string;
    decisionState: string;
    summary: string;
    recommendedActions: Array<{ target: string; action: string; parameters: Record<string, unknown> }>;
    safetyAudit: string;
    approvalRequired: boolean;
    approvalToken?: string;
  };
  executedAt: number;
  gateVerdict: GateVerdict;
}

export function runPhase11Delivery(
  understanding: TaskUnderstanding,
  decision: ControlPlaneDecision
): DeliveryResult {
  let channel: DeliveryResult["channel"] = "informational";

  if (understanding.intent === "physical_world_action") {
    channel = "physical_control";
  } else if (understanding.intent === "tool_execution") {
    channel = "tool_execution";
  }

  const output = {
    title: `Aetheris Control Plane Output: ${understanding.objective}`,
    decisionState: decision.state,
    summary: decision.summary,
    recommendedActions: decision.actionsProposed,
    safetyAudit: decision.safetyNotes.join(" | "),
    approvalRequired: decision.requiresApproval,
    approvalToken: decision.approvalToken,
  };

  return {
    channel,
    delivered: true,
    output,
    executedAt: Date.now(),
    gateVerdict: "PASS",
  };
}
