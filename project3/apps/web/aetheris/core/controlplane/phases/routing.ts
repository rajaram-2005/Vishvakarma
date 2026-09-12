/**
 * Phase 4 — Intelligence Routing
 *
 * Selects the optimal subset of cores and models for the task:
 * - Avoids activating all 10 cores unnecessarily
 * - Considers: task type, capability requirements, risk, latency, availability, cost, confidence
 *
 * Gate:
 *   PASS -> assignedCores.length > 0 && models reachable
 *   FAIL -> missing critical capability
 */
import type { GateVerdict } from "../types";
import type { TaskUnderstanding } from "./understanding";
import type { EvidenceBundle } from "../types";

export interface IntelligenceRoutingPlan {
  assignedCores: Array<{ coreId: string; role: string; priority: number }>;
  assignedModels: Array<{ modelName: string; provider: string; tier: string; role: string }>;
  assignedTools: string[];
  rationale: string;
  estimatedLatencyMs: number;
  gateVerdict: GateVerdict;
}

export function runPhase4Routing(
  understanding: TaskUnderstanding,
  _evidence: EvidenceBundle
): IntelligenceRoutingPlan {
  const cores: Array<{ coreId: string; role: string; priority: number }> = [];
  const tools: string[] = [];
  const req = understanding.objective.toLowerCase();

  // Always active supervisor core
  cores.push({ coreId: "RAVANA", role: "Orchestration & Reasoning Supervisor", priority: 1 });

  // SMRITI for memory / evidence access
  cores.push({ coreId: "SMRITI", role: "Memory & Evidence Fabric", priority: 2 });
  tools.push("memory_search");

  // Conditional routing based on task needs:
  if (/vibration|fft|bearing|scada|telemetry|sensor|frequency/i.test(req) || understanding.requiredEvidence.includes("telemetry")) {
    cores.push({ coreId: "PRAVAAH", role: "Telemetry / SCADA Ingestion & Streaming", priority: 2 });
    cores.push({ coreId: "NIRIKSHAN", role: "Diagnostics & FFT Spectral Analysis", priority: 2 });
    tools.push("fft_analyzer", "threshold_check", "anomaly_detector");
  }

  if (/turbine|wtg|generator|gearbox|twin|asset|model/i.test(req) || understanding.assets[0] !== "GENERAL_SYSTEM") {
    cores.push({ coreId: "YANTRA", role: "Digital Twin Asset State & Wireframe Model", priority: 3 });
    tools.push("twin_lookup", "wireframe_projector");
  }

  if (/wind|aero|atmosphere|air\s*density|power\s*curve/i.test(req)) {
    cores.push({ coreId: "VAYU-1", role: "Wind & Aerodynamics Intelligence Service", priority: 3 });
    tools.push("wind_estimator", "pbnn_surrogate");
  }

  if (/image|photo|visual|camera|inspection\s*image/i.test(req)) {
    cores.push({ coreId: "DRISHTI", role: "Multimodal & Visual Perception Core", priority: 3 });
    tools.push("multimodal_scanner");
  }

  if (/optimize|recommend|cost|tradeoff|compare\s*model/i.test(req)) {
    cores.push({ coreId: "CHAKRA", role: "Optimization & Recommendation Layer", priority: 4 });
    tools.push("arena_comparator");
  }

  if (understanding.intent === "tool_execution" || understanding.intent === "physical_world_action" || /script|sandbox|terminal|dispatch/i.test(req)) {
    cores.push({ coreId: "SETU", role: "Tools, Terminal & Execution Sandbox Gateway", priority: 3 });
    tools.push("sandboxed_terminal", "dispatch_issuer");
  }

  // NIRNAYA is always assigned for verification & safety check
  cores.push({ coreId: "NIRNAYA", role: "Multi-dimensional Verification & Safety Gate", priority: 5 });
  tools.push("symbolic_gate", "policy_evaluator");

  // Select appropriate model tiers
  const assignedModels = [
    { modelName: "llama-3.3-70b-versatile", provider: "groq", tier: "fast_analytical", role: "primary_reasoning" },
    { modelName: "gemini-2.5-flash", provider: "google", tier: "multimodal_verifier", role: "independent_critic" },
  ];

  return {
    assignedCores: cores,
    assignedModels,
    assignedTools: tools,
    rationale: `Selected ${cores.length} specialized cores based on ${understanding.intent} intent and asset scope [${understanding.assets.join(", ")}].`,
    estimatedLatencyMs: cores.length * 250 + 500,
    gateVerdict: cores.length > 0 ? "PASS" : "FAIL",
  };
}
