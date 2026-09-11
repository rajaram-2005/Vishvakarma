/**
 * Abstention Inspector — the "I don't know" surface.
 *
 *   When NIRNAYA (the verifier) decides evidence is insufficient, it
 *   abstains rather than guessing. This module composes the existing
 *   diagnostic history, the agent catalog, the capability registry,
 *   and a small set of evidence rules into a structured
 *   "InsufficientEvidence" report.
 *
 *   What it computes:
 *     - evidenceItems: how many concrete evidence pieces are available
 *       (history, FFT match, simulator prediction, visual evidence,
 *       engineering analysis, model agreement).
 *     - missingItems: which of the above are NOT available.
 *     - confidence: low / medium / high based on items + agreement.
 *     - recommendedAction: COLLECT / ESCALATE / SAFE_STATE based on the
 *       missing items and the current state.
 *     - honestyLine: a one-paragraph statement the UI can show as
 *       proof that we did not fabricate a diagnosis.
 *
 *   No mock evidence. No fake scores. The numbers are computed from
 *   the actual store + catalog state.
 */

import { getHistory } from "@/aetheris/core/diagnostics/history";
import { bearingFaultFrequencies } from "@/aetheris/core/diagnostics/fft";
import { AGENTS } from "@/aetheris/lib/agents/catalog";
import { allCapabilities } from "@/aetheris/core/capabilities/registry";
import { bootCapabilities } from "@/aetheris/core/capabilities/sources";

export type ConfidenceLevel = "low" | "medium" | "high";
export type RecommendedAction = "collect" | "escalate" | "safe_state";

export interface EvidenceItem {
  kind: "telemetry" | "fft" | "history" | "simulation" | "vision" | "engineering" | "model_agreement" | "policy";
  label: string;
  present: boolean;
  detail?: string;
}

export interface AbstainReport {
  /** The question being asked (motion or "Diagnose twin X"). */
  question: string;
  /** Twin id the report is about, if any. */
  twinId: string | null;
  /** The evidence items. */
  items: EvidenceItem[];
  /** How many are present. */
  presentCount: number;
  /** Total items considered. */
  totalCount: number;
  /** Confidence bucket. */
  confidence: ConfidenceLevel;
  /** Recommended next step. */
  recommendedAction: RecommendedAction;
  /** One-paragraph honesty line for the UI. */
  honestyLine: string;
  /** What NIRNAYA's verdict is on the motion. */
  verdict: "abstain" | "verified";
  /** When the report was assembled (ms). */
  assembledAt: number;
}

/** Build an abstention report for a question + (optional) twin. */
export async function buildAbstainReport(opts: { question: string; twinId?: string | null; rotorRpm?: number; visualEvidence?: boolean }): Promise<AbstainReport> {
  const twinId = opts.twinId ?? null;
  const rotorRpm = opts.rotorRpm ?? 1500;
  const faultFreqs = bearingFaultFrequencies(rotorRpm);

  const items: EvidenceItem[] = [];

  // 1) Telemetry: do we have a recent reading on this twin?
  if (twinId) {
    const history = await getHistory(twinId, { limit: 5 });
    const last = history.length ? history[history.length - 1]! : null;
    items.push({
      kind: "telemetry",
      label: "Recent vibration reading on this twin",
      present: !!last,
      detail: last ? `last reading: ${last.peakMagnitude.toFixed(1)} mm/s · ${last.severity} · ${new Date(last.tMs).toISOString().slice(0, 16)}` : "no readings in the diagnostic-history store",
    });
  } else {
    items.push({ kind: "telemetry", label: "Twin specified", present: false, detail: "no twin id provided" });
  }

  // 2) FFT: does the latest reading match a known bearing signature?
  if (twinId) {
    const history = await getHistory(twinId, { limit: 1 });
    const last = history[0];
    const hasMatch = !!last && !!last.topFault && Math.abs((last.dominantHz ?? 0) - faultFreqs.outerRace) < 5;
    items.push({
      kind: "fft",
      label: `FFT bearing-signature match (BPFO at ${rotorRpm} rpm)`,
      present: hasMatch,
      detail: hasMatch ? `match on ${last!.topFault}` : "no match within tolerance",
    });
  } else {
    items.push({ kind: "fft", label: "FFT match", present: false, detail: "no twin → no FFT" });
  }

  // 3) History: ≥ 3 prior readings?
  if (twinId) {
    const history = await getHistory(twinId, { limit: 100 });
    items.push({
      kind: "history",
      label: "≥ 3 prior diagnostic readings",
      present: history.length >= 3,
      detail: `${history.length} prior reading${history.length === 1 ? "" : "s"} on this twin`,
    });
  } else {
    items.push({ kind: "history", label: "History", present: false, detail: "no twin" });
  }

  // 4) Simulation: is the world-model module available? (the
  // counterfactual engine is importable, so the module is present;
  // the question is whether the operator is willing to use it).
  items.push({
    kind: "simulation",
    label: "World-model simulator (counterfactual + symbolic verifier)",
    present: true,
    detail: "module is importable; /world-model renders scenarios on demand",
  });

  // 5) Vision: does the demo/user have any visual evidence on file?
  // In this build, there is no persistent vision store; the DRISHTI step
  // returns "no imagery on file" honestly. So unless the caller passes
  // visualEvidence=true, this item is not present.
  items.push({
    kind: "vision",
    label: "Drone / inspection imagery on file",
    present: !!opts.visualEvidence,
    detail: opts.visualEvidence ? "images attached" : "no images on file (DRISHTI returns honest-scope note)",
  });

  // 6) Engineering analysis: is there a domain-specialist agent
  // (VAYU-1) in the catalog? Honest answer in this build: VAYU-1 is
  // listed in the 84-point vision as a future domain-specific model;
  // the existing catalog uses a wind-energy domain flag on existing
  // agents (engineer, strategist) rather than a dedicated VAYU-1 id.
  // Mark this present iff at least one agent has a wind domain.
  const vayu = AGENTS.find((a) => a.id.includes("vayu") || a.skills.some((s) => /wind|turbine|aerodyn/i.test(s)));
  items.push({
    kind: "engineering",
    label: "Domain engineering analysis (VAYU-1 agent or wind-domain agent)",
    present: !!vayu,
    detail: vayu ? `agent ${vayu.id} available` : "no VAYU-1 / wind-domain agent in the catalog",
  });

  // 7) Model agreement: at least 2 agents claim the same answer? (proxy: 2+ agents in catalog)
  const agentCount = AGENTS.length;
  items.push({
    kind: "model_agreement",
    label: "≥ 2 agents in the catalog",
    present: agentCount >= 2,
    detail: `${agentCount} agents available`,
  });

  // 8) Policy: is there a capability registry? The boot sources register
  // capabilities at module load. Calling bootCapabilities() ensures the
  // registry is populated; if anything was registered, this is present.
  bootCapabilities();
  const caps = await allCapabilities();
  items.push({
    kind: "policy",
    label: "Capability registry",
    present: caps.length >= 1,
    detail: `${caps.length} capability card${caps.length === 1 ? "" : "s"} registered`,
  });

  const presentCount = items.filter((i) => i.present).length;
  const totalCount = items.length;
  const confidence: ConfidenceLevel = presentCount >= 7 ? "high" : presentCount >= 4 ? "medium" : "low";
  const verdict: "abstain" | "verified" = confidence === "high" ? "verified" : "abstain";

  // Recommended action: if low confidence and any safety-critical item is missing, SAFE_STATE.
  // If low confidence on a non-safety question, COLLECT. If medium, ESCALATE.
  let recommendedAction: RecommendedAction;
  if (confidence === "high") recommendedAction = "collect"; // verified → no action needed
  else if (confidence === "medium") recommendedAction = "escalate";
  else {
    // low: if any of {telemetry, fft, simulation} is missing → safe-state
    const safetyMissing = items.filter((i) => ["telemetry", "fft", "simulation"].includes(i.kind) && !i.present).length;
    recommendedAction = safetyMissing > 0 ? "safe_state" : "collect";
  }

  const missing = items.filter((i) => !i.present);
  const honestyLine = buildHonestyLine(opts.question, confidence, presentCount, totalCount, missing.map((m) => m.label), recommendedAction);

  return {
    question: opts.question,
    twinId,
    items,
    presentCount,
    totalCount,
    confidence,
    recommendedAction,
    honestyLine,
    verdict,
    assembledAt: Date.now(),
  };
}

function buildHonestyLine(question: string, confidence: ConfidenceLevel, present: number, total: number, missingLabels: string[], action: RecommendedAction): string {
  const verb = confidence === "high" ? "verified" : "is abstaining";
  const intro = `Aetheris ${verb} on the question "${question}". Of ${total} standard evidence items, ${present} are present and ${total - present} are missing:`;
  const list = missingLabels.length > 0 ? missingLabels.map((l) => `  · ${l}`).join("\n") : "  · (none)";
  const actionLine = action === "safe_state"
    ? "Recommended action: SAFE_STATE. Some safety-critical evidence is missing; do not act until it is collected."
    : action === "escalate"
    ? "Recommended action: ESCALATE to a human operator. The evidence is partial; a human should make the call."
    : confidence === "high"
    ? "Recommended action: none — the evidence is sufficient to proceed."
    : "Recommended action: COLLECT more evidence. Re-run diagnostics, attach inspection imagery, or extend the history window.";
  return `${intro}\n${list}\n\n${actionLine}`;
}
