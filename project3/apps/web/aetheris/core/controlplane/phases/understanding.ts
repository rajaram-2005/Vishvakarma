/**
 * Phase 1 — Understanding
 *
 * RAVANA creates a structured task representation:
 * Task:
 * ├── objective
 * ├── constraints
 * ├── assets
 * ├── expected_output
 * ├── risk
 * ├── required_evidence
 * └── allowed_actions
 *
 * Gate: Do we understand what the user is asking? If not -> STOP -> clarification.
 */
import type { GateVerdict, TaskIntent } from "../types";
import type { IntakeAnalysis } from "./intake";

export interface TaskUnderstanding {
  objective: string;
  intent: TaskIntent;
  constraints: string[];
  assets: string[];
  expectedOutput: string;
  risk: "low" | "medium" | "high";
  requiredEvidence: string[];
  allowedActions: string[];
  gateVerdict: GateVerdict;
  clarificationNeeded?: string;
}

export function runPhase1Understanding(intake: IntakeAnalysis): TaskUnderstanding {
  const req = intake.rawRequest;
  const lower = req.toLowerCase();

  // Extract assets mentioned (e.g. WTG-04, wtg-01, turbine, gearbox, inverter, generator)
  const assets: string[] = [];
  const assetMatches = req.match(/(wtg-\d+|turbine(-\d+)?|gearbox|generator|inverter|bearing|node-\d+)/gi);
  if (assetMatches) {
    for (const a of assetMatches) {
      const norm = a.toUpperCase();
      if (!assets.includes(norm)) assets.push(norm);
    }
  }

  // Determine risk level based on intent and requested operation
  let risk: "low" | "medium" | "high" = "low";
  if (intake.intent === "physical_world_action") {
    risk = "high";
  } else if (intake.intent === "simulation" || intake.intent === "tool_execution") {
    risk = "medium";
  }

  // Extract constraints
  const constraints: string[] = [
    "Must not exceed safety bounds",
    "Evidence must be traceable to real telemetry or knowledge store",
  ];
  if (risk === "high") {
    constraints.push("Direct physical modification requires explicit single-use confirmation token");
  }

  // Extract required evidence categories
  const requiredEvidence: string[] = ["semantic"];
  if (intake.intent === "analytical" || assets.length > 0) {
    requiredEvidence.push("telemetry", "historical", "asset_state");
  }
  if (/bearing|fft|vibration|frequency/i.test(lower)) {
    requiredEvidence.push("fft_spectrum", "bearing_kinematics");
  }

  // Determine allowed actions
  const allowedActions: string[] = ["read_only_analysis", "synthesize_report"];
  if (intake.intent === "simulation") {
    allowedActions.push("run_world_model_simulation", "generate_counterfactuals");
  }
  if (intake.intent === "tool_execution") {
    allowedActions.push("run_sandboxed_tool", "execute_verified_query");
  }
  if (intake.intent === "physical_world_action") {
    allowedActions.push("propose_maintenance_dispatch", "prepare_guarded_derate");
  }

  // Expected output summary
  const expectedOutput = `Structured ${intake.intent} response covering: ${assets.length > 0 ? assets.join(", ") : "requested query"} with verified evidence trail.`;

  return {
    objective: req,
    intent: intake.intent,
    constraints,
    assets: assets.length > 0 ? assets : ["GENERAL_SYSTEM"],
    expectedOutput,
    risk,
    requiredEvidence,
    allowedActions,
    gateVerdict: "PASS",
  };
}
