/**
 * Phase 0 — Intake Gate
 *
 * Evaluates the incoming request:
 * - Identifies intent: informational, analytical, simulation, tool_execution, physical_world_action
 * - Determines completeness and ambiguity
 * - Performs pre-flight safety filter
 * - Gate verdict: PASS / CLARIFICATION / BLOCK / REJECT
 */
import type { GateVerdict, TaskIntent } from "../types";

export interface IntakeAnalysis {
  rawRequest: string;
  intent: TaskIntent;
  isComplete: boolean;
  isAmbiguous: boolean;
  clarificationPrompt?: string;
  safetyBlocked: boolean;
  blockReason?: string;
  gateVerdict: GateVerdict;
  scopeSummary: string;
}

const DANGEROUS_PATTERNS = [
  /override\s+e-?stop/i,
  /bypass\s+safety\s+interlock/i,
  /disable\s+thermal\s+cutoff/i,
  /force\s+unbounded\s+actuation/i,
  /ignore\s+rotor\s+speed\s+limit/i,
];

export function runPhase0Intake(request: string): IntakeAnalysis {
  const trimmed = (request || "").trim();
  if (!trimmed) {
    return {
      rawRequest: "",
      intent: "informational",
      isComplete: false,
      isAmbiguous: false,
      safetyBlocked: false,
      gateVerdict: "REJECT",
      scopeSummary: "Empty request rejected.",
    };
  }

  // Check pre-flight safety
  for (const pat of DANGEROUS_PATTERNS) {
    if (pat.test(trimmed)) {
      return {
        rawRequest: trimmed,
        intent: "physical_world_action",
        isComplete: true,
        isAmbiguous: false,
        safetyBlocked: true,
        blockReason: `Safety Pre-check triggered: Prohibited safety bypass attempt matched pattern ${pat}`,
        gateVerdict: "BLOCK",
        scopeSummary: "Blocked due to prohibited safety interlock bypass.",
      };
    }
  }

  // Check ambiguity / completeness
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length <= 1 && !["help", "status", "version", "demo"].includes(trimmed.toLowerCase())) {
    return {
      rawRequest: trimmed,
      intent: "informational",
      isComplete: false,
      isAmbiguous: true,
      clarificationPrompt: `The request "${trimmed}" is too brief or ambiguous. Could you provide more specific objectives, asset names, or tasks?`,
      safetyBlocked: false,
      gateVerdict: "CLARIFICATION",
      scopeSummary: "Request is ambiguous; clarification needed.",
    };
  }

  // Categorize intent
  let intent: TaskIntent = "informational";
  const lower = trimmed.toLowerCase();

  if (/actuate|override|dispatch|set\s+state|run\s+motor|trip|pitch\s+blade|open\s+breaker/i.test(lower)) {
    intent = "physical_world_action";
  } else if (/run|execute|script|terminal|compile|test|generate|calc|query\s+db/i.test(lower)) {
    intent = "tool_execution";
  } else if (/simulate|what\s*if|derate|scenario|forecast|predict|counterfactual/i.test(lower)) {
    intent = "simulation";
  } else if (/diagnos|vibration|fft|bearing|anomaly|telemetry|scada|inspect|analyze|compare/i.test(lower)) {
    intent = "analytical";
  }

  return {
    rawRequest: trimmed,
    intent,
    isComplete: true,
    isAmbiguous: false,
    safetyBlocked: false,
    gateVerdict: "PASS",
    scopeSummary: `Intent established as ${intent}. Request complete and within operational boundaries.`,
  };
}
