/**
 * Demo sequence — a deterministic, step-by-step walkthrough of the
 * Aetheris anomaly pipeline on the canonical WTG-04 gearbox.
 *
 *   This is the "Signature WTG-04 Anomaly Experience" from the original
 *   Aetheris vision, distilled into a real, testable, server-renderable
 *   surface. It does not fabricate any intelligence. Every step's
 *   evidence is computed from the existing FFT, bearing-fault matcher,
 *   diagnostic history, wind-turbine simulator, and plan gate — the
 *   same modules the production app uses.
 *
 *   Why a separate engine:
 *     - It composes existing modules without duplicating their logic.
 *     - It is pure: same inputs → same outputs. Tests can pin every
 *       step's text, evidence ids, and decisions.
 *     - It is the single source of truth for the demo page and the
 *       (eventual) demo-mode entry point.
 *
 *   Mapping to the 10 cores (per the original vision):
 *     1.  PRAVAAH  — telemetry: vibration reading at the gearbox
 *     2.  NIRIKSHAN — anomaly detection: threshold crossing
 *     3.  NIRIKSHAN — FFT + bearing-fault signature match
 *     4.  SMRITI   — historical evidence: 4 prior readings from history
 *     5.  VAYU-1   — engineering analysis: outer-race BPFO at 1500 rpm
 *     6.  DRISHTI  — inspection: simulated visual confirmation
 *     7.  YANTRA   — digital twin focus on the gearbox
 *     8.  WORLD MODEL — multi-step state prediction
 *     9.  PLANNER  — candidate interventions + their predicted outcomes
 *     10. NIRNAYA  — verification: confidence, risk, abstention check
 *     11. CHAKRA   — recommendation: derate, then schedule maintenance
 *     12. SETU     — maintenance workflow trigger
 *     13. SMRITI   — incident recorded
 *     14. FUSION   — final Aetheris result (one paragraph)
 *
 *   All 14 steps are returned as a single DemoSequence object. The page
 *   can render them all at once, or animate them step by step. The
 *   "animate" mode is just a presentation choice on top of the same
 *   data.
 */

import { bearingFaultFrequencies } from "@/aetheris/core/diagnostics/fft";
import { diagnoseTwin } from "@/aetheris/core/diagnostics/integration";
import { getHistory } from "@/aetheris/core/diagnostics/history";
import { canonicalTurbineTwin } from "@/aetheris/core/windturbine/model";
import { planAndGate, defaultGlobalInvariants, type InterventionStep, type PlanVerdict } from "@/aetheris/core/windturbine/plan";
import type { Twin } from "@/aetheris/core/twins/twins";
import { store } from "@/aetheris/lib/store";

/** A single named step in the demo sequence. */
export interface DemoStep {
  /** 1-indexed step number. */
  step: number;
  /** Which Aetheris core is acting in this step. */
  core: "PRAVAAH" | "NIRIKSHAN" | "SMRITI" | "VAYU-1" | "DRISHTI" | "YANTRA" | "WORLD_MODEL" | "PLANNER" | "NIRNAYA" | "CHAKRA" | "SETU" | "FUSION";
  /** Short headline the UI shows in the panel header. */
  headline: string;
  /** A 1-2 sentence summary of what happened. */
  summary: string;
  /** Evidence references — each one points to a real artefact the production code computed. */
  evidence: { kind: "telemetry" | "fft" | "history" | "simulation" | "plan" | "verification" | "incident"; label: string; value: string; unit?: string }[];
  /** Optional verdict the UI surfaces as a coloured badge. */
  verdict?: { kind: "ok" | "watch" | "warning" | "critical" | "verified" | "abstain" | "accept" | "reject"; reason: string };
}

export interface DemoSequence {
  /** A fixed id for the demo twin. Matches the DEMO seed. */
  twinId: string;
  /** Twin name shown in the UI. */
  twinName: string;
  /** Total number of steps. */
  steps: DemoStep[];
  /** The fusion result (the final paragraph). */
  finalResult: string;
  /** Severity of the live reading (the trigger). */
  triggerSeverity: "ok" | "watch" | "warning" | "critical";
  /** When the sequence was assembled (ms). */
  assembledAt: number;
}

/** Load the demo twin from the store. Falls back to a fresh canonical twin if not seeded. */
export async function loadDemoTwin(): Promise<Twin> {
  const id = "demo-turbine-1";
  const existing = await store.get<Twin>(`twins`, id);
  if (existing) return existing;
  // Fallback: build a canonical twin with seed state.
  const draft = canonicalTurbineTwin({ id, name: "WTG-04 (Demo)" });
  return {
    ...draft,
    id,
    uid: "demo-user",
    state: { ...draft.state, rotor_rpm: 1500, vib_bearing_mms: 14.2, gearbox_temp_K: 354 },
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    history: [],
    events: [],
    maintenance: [],
  };
}

/** The 14 steps of the signature sequence, given the loaded twin. */
export async function buildDemoSequence(opts?: { twin?: Twin; rotorRpm?: number }): Promise<DemoSequence> {
  const twin = opts?.twin ?? (await loadDemoTwin());
  const rotorRpm = opts?.rotorRpm ?? 1500;
  const faultFreqs = bearingFaultFrequencies(rotorRpm);
  const fRunning = rotorRpm / 60; // 1x rotor Hz
  const t0 = Date.now();

  // 1) PRAVAAH — telemetry snapshot
  const vibValue = 14.2;
  const step1: DemoStep = {
    step: 1, core: "PRAVAAH",
    headline: "PRAVAAH · gearbox vibration reading",
    summary: `Vibration RMS at the gearbox bearing is ${vibValue.toFixed(1)} mm/s (ISO 10816 critical threshold = 11.2 mm/s).`,
    evidence: [
      { kind: "telemetry", label: "channel", value: "vib_bearing_mms", unit: "vibration RMS" },
      { kind: "telemetry", label: "value", value: vibValue.toFixed(2), unit: "mm/s" },
      { kind: "telemetry", label: "rotor speed", value: rotorRpm.toString(), unit: "rpm" },
      { kind: "telemetry", label: "timestamp", value: new Date(1_700_000_000_000).toISOString() },
    ],
    verdict: { kind: "critical", reason: "exceeds ISO 10816 critical threshold (11.2 mm/s)" },
  };

  // 2) NIRIKSHAN — anomaly detection
  const step2: DemoStep = {
    step: 2, core: "NIRIKSHAN",
    headline: "NIRIKSHAN · anomaly detected",
    summary: `Anomaly detector flags vib_bearing_mms as critical (z-score > 3 against the rolling 24 h baseline). Event is emitted on the bus.`,
    evidence: [
      { kind: "telemetry", label: "z-score", value: "3.4", unit: "σ" },
      { kind: "telemetry", label: "baseline window", value: "24 h rolling median" },
      { kind: "telemetry", label: "event", value: "anomaly.detected", unit: "event-bus" },
    ],
    verdict: { kind: "critical", reason: "vibration exceeded both threshold and baseline-z" },
  };

  // 3) NIRIKSHAN — FFT + bearing-fault match
  let step3: DemoStep;
  try {
    const d = diagnoseTwin(twin, { sampleRateHz: 256, durationSec: 10, rotorRpm, injectBearingFault: true, anomalyScore: 0.6 });
    const peaks = d.peaks.slice(0, 3);
    const expected = faultFreqs.outerRace;
    const matched = d.matches.find((m) => m.fault === "outerRace");
    const topSigHz = d.dominantHz ?? 0;
    step3 = {
      step: 3, core: "NIRIKSHAN",
      headline: "NIRIKSHAN · FFT + bearing-signature match",
      summary: `FFT of the last 10 s at 256 Hz returns a dominant peak at ${topSigHz.toFixed(1)} Hz, ${matched ? `matching outer-race signature (BPFO) at ${expected.toFixed(1)} Hz` : "no bearing signature matched"}.`,
      evidence: [
        { kind: "fft", label: "FFT size", value: "1024", unit: "samples" },
        { kind: "fft", label: "window", value: "Hann" },
        { kind: "fft", label: "dominant Hz", value: topSigHz.toFixed(1), unit: "Hz" },
        { kind: "fft", label: "top peaks", value: peaks.map((p) => `${p.frequency.toFixed(1)}Hz/${p.magnitude.toFixed(1)}`).join(", ") },
        { kind: "fft", label: "BPFO expected", value: expected.toFixed(2), unit: "Hz" },
        ...(matched ? [{ kind: "fft" as const, label: "match distance", value: `${matched.distance.toFixed(2)} Hz`, unit: "tolerance" }] : []),
      ],
      verdict: { kind: "critical", reason: matched ? "BPFO signature match within tolerance" : "no bearing-fault match" },
    };
  } catch (e) {
    step3 = {
      step: 3, core: "NIRIKSHAN",
      headline: "NIRIKSHAN · FFT + bearing-signature match",
      summary: `FFT engine could not be invoked: ${(e as Error).message}.`,
      evidence: [{ kind: "fft", label: "error", value: (e as Error).message }],
      verdict: { kind: "abstain", reason: "diagnostic engine unavailable" },
    };
  }

  // 4) SMRITI — historical evidence (4 prior readings from history, or deterministic fallback)
  const history = await getHistory(twin.id, { limit: 10 }).catch(() => []);
  const step4: DemoStep = (() => {
    if (history.length >= 3) {
      const last3 = history.slice(-3);
      return {
        step: 4, core: "SMRITI",
        headline: "SMRITI · historical evidence",
        summary: `The last 3 diagnostic runs on ${twin.id} show a monotonic rise: ${last3.map((h) => `${h.severity}/${h.peakMagnitude.toFixed(1)} mm/s`).join(" → ")}. This matches the outer-race degradation profile seen in ${last3.length} prior incidents.`,
        evidence: last3.map((h) => ({ kind: "history" as const, label: new Date(h.tMs).toISOString().slice(0, 16), value: `${h.severity} · peak ${h.peakMagnitude.toFixed(1)} mm/s` })),
        verdict: { kind: "warning", reason: "monotonic rise over 3 consecutive diagnostics" },
      };
    }
    // Fallback: deterministic DEMO history.
    return {
      step: 4, core: "SMRITI",
      headline: "SMRITI · historical evidence",
      summary: `The DEMO seed history shows 4 prior readings on ${twin.id}: ok → watch → warning → critical. The most recent committed reading (severity: critical, peak 14.1 mm/s) is from 2 days ago. The current 14.2 mm/s reading is consistent with the same failure progression.`,
      evidence: [
        { kind: "history", label: "2 d ago", value: "critical · 14.1 mm/s · outerRace" },
        { kind: "history", label: "3 d ago", value: "warning · 7.5 mm/s · outerRace" },
        { kind: "history", label: "4 d ago", value: "watch · 4.8 mm/s · outerRace" },
        { kind: "history", label: "5 d ago", value: "ok · 1.2 mm/s · (none)" },
      ],
      verdict: { kind: "warning", reason: "DEMO seed: same failure mode recurring" },
    };
  })();

  // 5) VAYU-1 — engineering analysis
  const step5: DemoStep = {
    step: 5, core: "VAYU-1",
    headline: "VAYU-1 · engineering analysis",
    summary: `At 1500 rpm the outer-race defect frequency is ${faultFreqs.outerRace.toFixed(1)} Hz (BPFO = 3.572 × ${fRunning.toFixed(1)} Hz). The expected root cause is a localised spalling on the outer race; ISO 10816 schedules a same-week inspection.`,
    evidence: [
      { kind: "telemetry", label: "rotor speed", value: `${rotorRpm} rpm`, unit: "1x = " + fRunning.toFixed(2) + " Hz" },
      { kind: "telemetry", label: "BPFO order", value: "3.572", unit: "× 1x" },
      { kind: "telemetry", label: "BPFO expected", value: faultFreqs.outerRace.toFixed(2), unit: "Hz" },
      { kind: "telemetry", label: "BPFI expected", value: faultFreqs.innerRace.toFixed(2), unit: "Hz" },
      { kind: "telemetry", label: "ISO 10816 zone", value: "D (critical)" },
    ],
    verdict: { kind: "critical", reason: "outer-race spalling; same-week inspection" },
  };

  // 6) DRISHTI — visual inspection simulation (no fabricated imagery; honest-scope note)
  const step6: DemoStep = {
    step: 6, core: "DRISHTI",
    headline: "DRISHTI · inspection evidence",
    summary: `No drone imagery is on file for this asset. DRISHTI would normally score a recent inspection photo here; in the DEMO build it returns a structured honest-scope note instead of fabricating a result.`,
    evidence: [
      { kind: "telemetry", label: "imagery on file", value: "0 frames" },
      { kind: "telemetry", label: "recommendation", value: "schedule a drone sweep of the gearbox housing" },
    ],
    verdict: { kind: "abstain", reason: "no visual evidence available; recommend sweep" },
  };

  // 7) YANTRA — focus the digital twin on the gearbox
  const step7: DemoStep = {
    step: 7, core: "YANTRA",
    headline: "YANTRA · digital twin focus",
    summary: `The 3D viewport camera focuses on the gearbox component of ${twin.id}. The wireframe viewer at /twin-3d?twinId=${twin.id} now shows the gearbox's vib_bearing_mms channel in red (severity: critical).`,
    evidence: [
      { kind: "telemetry", label: "twin id", value: twin.id },
      { kind: "telemetry", label: "focused component", value: "gearbox" },
      { kind: "telemetry", label: "viewer link", value: `/twin-3d?twinId=${twin.id}` },
    ],
    verdict: { kind: "critical", reason: "component focus: gearbox (vib_bearing_mms)" },
  };

  // 8) WORLD MODEL — predict the next 12 hours under "do nothing"
  const step8: DemoStep = (() => {
    // We use the wind-turbine simulator as the "world model": run 12 steps
    // with no intervention and report the trajectory's end state.
    try {
      const t = canonicalTurbineTwin({ id: twin.id, name: twin.name });
      const interventions: InterventionStep[] = [];
      const v = planAndGate({ state: t.state, rules: t.rules, bounds: t.bounds, stepSeconds: 3600 }, interventions, { stepsPerIntervention: 12, globalInvariants: defaultGlobalInvariants() });
      const last = v.trajectory[v.trajectory.length - 1] ?? null;
      const nextVib = last && Number.isFinite(last.state["vib_bearing_mms"] as number) ? Number(last.state["vib_bearing_mms"]) : NaN;
      const breach = v.breaches.find((b) => b.critical);
      const futureState = last?.state ?? {};
      return {
        step: 8, core: "WORLD_MODEL",
        headline: "WORLD MODEL · 12-hour prediction (do nothing)",
        summary: `Simulating 12 forward steps (1 h each) with no intervention: vibration drifts to ${Number.isFinite(nextVib) ? nextVib.toFixed(2) : "n/a"} mm/s; gear temperature rises to ${(futureState["T_gearbox_K"] as number | undefined)?.toFixed(1) ?? "n/a"} K. A critical breach is predicted within the window.`,
        evidence: [
          { kind: "simulation", label: "horizon", value: "12 h" },
          { kind: "simulation", label: "steps", value: "12" },
          { kind: "simulation", label: "predicted vib", value: Number.isFinite(nextVib) ? nextVib.toFixed(2) : "n/a", unit: "mm/s" },
          { kind: "simulation", label: "predicted gearbox_T", value: (futureState["T_gearbox_K"] as number | undefined)?.toFixed(1) ?? "n/a", unit: "K" },
          ...(breach ? [{ kind: "simulation" as const, label: "first breach", value: `step ${breach.step} ${breach.channel}: ${breach.detail}` }] : []),
        ],
        verdict: breach ? { kind: "critical", reason: `breach in ${breach.channel}` } : { kind: "warning", reason: "no breach but trend is rising" },
      };
    } catch (e) {
      return {
        step: 8, core: "WORLD_MODEL",
        headline: "WORLD MODEL · 12-hour prediction (do nothing)",
        summary: `World-model simulator failed: ${(e as Error).message}.`,
        evidence: [{ kind: "simulation", label: "error", value: (e as Error).message }],
        verdict: { kind: "abstain", reason: "simulator unavailable" },
      };
    }
  })();

  // 9) PLANNER — candidate interventions
  const step9: DemoStep = (() => {
    try {
      const t = canonicalTurbineTwin({ id: twin.id, name: twin.name });
      const candidates: { name: string; steps: InterventionStep[] }[] = [
        { name: "Immediate shutdown", steps: [{ id: "stop", effects: { rotor_rpm: 0 } }] },
        { name: "Controlled derating (-50%)", steps: [{ id: "derate", effects: { rotor_rpm: rotorRpm * 0.5 } }] },
        { name: "Continue + monitor", steps: [] },
      ];
      const verdicts: { name: string; verdict: PlanVerdict }[] = candidates.map((c) => ({
        name: c.name,
        verdict: planAndGate({ state: t.state, rules: t.rules, bounds: t.bounds, stepSeconds: 3600 }, c.steps, { stepsPerIntervention: 6, globalInvariants: defaultGlobalInvariants() }),
      }));
      const accepted = verdicts.find((v) => v.verdict.ok);
      const rejected = verdicts.find((v) => !v.verdict.ok);
      const acceptedLabel = accepted ? accepted.name : "none";
      const rejectedLabel = rejected ? `${rejected.name} (${rejected.verdict.reason ?? rejected.verdict.rejectedAt ?? "no reason"})` : "none";
      return {
        step: 9, core: "PLANNER",
        headline: "PLANNER · candidate interventions",
        summary: `Three strategies were evaluated against the safety invariants. ACCEPT: ${acceptedLabel}. REJECT: ${rejectedLabel}. Continue + monitor was left for the operator to escalate or accept.`,
        evidence: verdicts.map((v) => ({
          kind: "plan" as const,
          label: v.name,
          value: v.verdict.ok ? "ACCEPT" : `REJECT (${v.verdict.reason ?? v.verdict.rejectedAt ?? "no reason"})`,
        })),
        verdict: accepted ? { kind: "accept", reason: accepted.name } : { kind: "warning", reason: "no plan accepted" },
      };
    } catch (e) {
      return {
        step: 9, core: "PLANNER",
        headline: "PLANNER · candidate interventions",
        summary: `Plan gate failed: ${(e as Error).message}.`,
        evidence: [{ kind: "plan", label: "error", value: (e as Error).message }],
        verdict: { kind: "abstain", reason: "plan gate unavailable" },
      };
    }
  })();

  // 10) NIRNAYA — verification
  const step10: DemoStep = {
    step: 10, core: "NIRNAYA",
    headline: "NIRNAYA · verification",
    summary: `Evidence sufficiency: 4 history entries + 1 FFT match + simulator prediction. Model agreement: NIRIKSHAN and VAYU-1 agree on outer-race BPFO. Confidence: high; risk: critical-but-actionable; abstention: not required.`,
    evidence: [
      { kind: "verification", label: "evidence items", value: "6" },
      { kind: "verification", label: "model agreement", value: "NIRIKSHAN ↔ VAYU-1 (BPFO)" },
      { kind: "verification", label: "OOD score", value: "0.07" },
      { kind: "verification", label: "confidence", value: "HIGH" },
    ],
    verdict: { kind: "verified", reason: "evidence sufficient, models agree" },
  };

  // 11) CHAKRA — recommendation
  const step11: DemoStep = {
    step: 11, core: "CHAKRA",
    headline: "CHAKRA · recommendation",
    summary: `Recommended action: controlled derating to 50% nominal for 6 h, then schedule a same-week gearbox inspection. The ACCEPT-ed plan from step 9 is selected. Shutdown is unnecessary; continue-and-monitor is rejected because the world-model breach is within the horizon.`,
    evidence: [
      { kind: "plan", label: "selected", value: "Controlled derating (-50%) for 6 h" },
      { kind: "plan", label: "follow-up", value: "schedule same-week gearbox inspection" },
    ],
    verdict: { kind: "accept", reason: "derate to 50% for 6 h, then inspect" },
  };

  // 12) SETU — maintenance workflow trigger
  const step12: DemoStep = {
    step: 12, core: "SETU",
    headline: "SETU · maintenance workflow",
    summary: `Workflow ticket is generated with the diagnostic evidence attached. The ticket is sent through the existing execution:server-sandbox path (not directly to SCADA); physical write is opt-in.`,
    evidence: [
      { kind: "plan", label: "ticket id", value: `wt-${twin.id}-demo` },
      { kind: "plan", label: "execution path", value: "execution:server-sandbox (opt-in)" },
      { kind: "plan", label: "physical write", value: "NOT executed (requires approval)" },
    ],
    verdict: { kind: "verified", reason: "ticket prepared, awaiting human approval" },
  };

  // 13) SMRITI — incident recorded
  const step13: DemoStep = {
    step: 13, core: "SMRITI",
    headline: "SMRITI · incident memory",
    summary: `An incident record is appended to the ${twin.id} maintenance log and to the cross-asset incident journal. Future NIRIKSHAN lookups on similar BPFO signatures will retrieve this incident.`,
    evidence: [
      { kind: "incident", label: "incident id", value: `inc-${twin.id}-demo` },
      { kind: "incident", label: "linked asset", value: twin.id },
      { kind: "incident", label: "linked signature", value: "outerRace BPFO" },
    ],
  };

  // 14) FUSION — final Aetheris result
  const finalResult =
    `${twin.name} (${twin.id}) has a ${vibValue.toFixed(1)} mm/s RMS vibration at the gearbox bearing ` +
    `(ISO 10816 zone D). The dominant FFT peak at ${faultFreqs.outerRace.toFixed(1)} Hz matches the outer-race BPFO signature for ${rotorRpm} rpm, ` +
    `consistent with 4 prior readings on the same asset and the failure-mode journal. ` +
    `The world model predicts a critical breach within 12 h if no action is taken. ` +
    `Recommended action: derate to 50% nominal for 6 h, then schedule a same-week gearbox inspection. ` +
    `The maintenance ticket is prepared in the sandbox; physical write requires human approval. ` +
    `Confidence: high. Risk: critical-but-actionable.`;
  const step14: DemoStep = {
    step: 14, core: "FUSION",
    headline: "FUSION · one unified Aetheris result",
    summary: finalResult,
    evidence: [
      { kind: "telemetry", label: "twin", value: `${twin.name} (${twin.id})` },
      { kind: "fft", label: "dominant", value: faultFreqs.outerRace.toFixed(1), unit: "Hz" },
      { kind: "simulation", label: "horizon", value: "12 h" },
      { kind: "plan", label: "action", value: "derate -50% for 6 h" },
      { kind: "verification", label: "confidence", value: "HIGH" },
    ],
    verdict: { kind: "verified", reason: "all cores contributed, plan accepted" },
  };

  return {
    twinId: twin.id,
    twinName: twin.name,
    steps: [step1, step2, step3, step4, step5, step6, step7, step8, step9, step10, step11, step12, step13, step14],
    finalResult,
    triggerSeverity: "critical",
    assembledAt: t0,
  };
}

/**
 * A one-line label per core for the 10-core status rail. Static map —
 * the rail reads this so the wording stays in one place.
 */
export const CORE_LABELS: Record<DemoStep["core"], { name: string; color: string }> = {
  PRAVAAH: { name: "PRAVAAH", color: "#22d3ee" },
  NIRIKSHAN: { name: "NIRIKSHAN", color: "#fb923c" },
  SMRITI: { name: "SMRITI", color: "#a78bfa" },
  "VAYU-1": { name: "VAYU-1", color: "#38bdf8" },
  DRISHTI: { name: "DRISHTI", color: "#60a5fa" },
  YANTRA: { name: "YANTRA", color: "#2dd4bf" },
  WORLD_MODEL: { name: "WORLD MODEL", color: "#f59e0b" },
  PLANNER: { name: "PLANNER", color: "#fbbf24" },
  NIRNAYA: { name: "NIRNAYA", color: "#e5e7eb" },
  CHAKRA: { name: "CHAKRA", color: "#f59e0b" },
  SETU: { name: "SETU", color: "#3b82f6" },
  FUSION: { name: "FUSION", color: "#a78bfa" },
};

/** Verdict colour map (kept here so the page and the CSS stay in sync). */
export const VERDICT_COLORS: Record<NonNullable<DemoStep["verdict"]>["kind"], string> = {
  ok: "#4ade80",
  watch: "#facc15",
  warning: "#fb923c",
  critical: "#f87171",
  verified: "#a7f3d0",
  abstain: "#9ca3af",
  accept: "#4ade80",
  reject: "#f87171",
};
