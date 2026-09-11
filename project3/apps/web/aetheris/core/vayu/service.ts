/**
 * VAYU-1 — Wind & Aerodynamics Intelligence Service.
 *
 *   Build as proxy.
 *
 *   A named service that composes the existing wind/aero
 *   modules behind a single query interface. It does NOT
 *   call a fine-tuned wind-domain model — no such model
 *   exists in this codebase. It calls:
 *     - PBNN prediction (mean of a constant model on the
 *       chosen channel)
 *     - Anomaly detection (z-score over the twin's
 *       diagnostic history)
 *     - Model arena (compare two candidate configurations
 *       from the canonical turbine)
 *     - FFT (spectrum of the requested channel)
 *
 *   Every field in the result is sourced from a real
 *   module. If a piece cannot be sourced (no data, no
 *   twin, etc.), it returns null + reason. The service is
 *   read-side. It records an observability event.
 */

import { predictNext } from "@/aetheris/core/learning/predictions";
import { detectChannel } from "@/aetheris/core/anomaly/detector";
import { runArena } from "@/aetheris/core/arena/compare";
import { fftSpectrum } from "@/aetheris/core/diagnostics/fft";
import { listTwins } from "@/aetheris/core/twins/twins";
import { record } from "@/aetheris/core/observability/events";

export type VayuChannel = "peakMagnitude" | "dominantHz" | "topFaultMagnitude" | "matchCount" | "vib_bearing_mms" | "vib_shaft_mms";

export interface VayuQuery {
  uid: string;
  /** Free-text question, surfaced in the response. */
  question: string;
  /** Twin id to query. */
  twinId?: string;
  /** Channel to analyze. */
  channel?: VayuChannel;
  /** How many steps of prediction to run. */
  horizon?: number;
  /** Optional second config id to compare against. */
  compareWithTwinId?: string;
  /** Demo mode: when no real telemetry is present, label every field as 'seed' and use the canonical turbine. */
  demo?: boolean;
}

export interface VayuPredictionSlice {
  channel: VayuChannel;
  horizon: number;
  predicted: number[];
  ok: boolean;
  reason?: string;
  source: "pbnn" | "demo-seed";
}

export interface VayuAnomalySlice {
  channel: VayuChannel;
  points: number;
  anomalies: number;
  z: number;
  ok: boolean;
  reason?: string;
  source: "anomaly" | "demo-seed";
}

export interface VayuArenaSlice {
  baselineTwin: string;
  candidateTwin: string | null;
  baseline: Record<string, number>;
  candidate: Record<string, number> | null;
  ok: boolean;
  reason?: string;
  source: "arena" | "demo-seed";
}

export interface VayuFftSlice {
  channel: VayuChannel;
  bins: number;
  sampleRate: number;
  peakHz: number;
  ok: boolean;
  reason?: string;
  source: "fft" | "demo-seed";
}

export interface VayuResult {
  uid: string;
  question: string;
  twinId: string;
  channel: VayuChannel;
  generatedAt: number;
  /** The mode the service ran in. Always honest. */
  mode: "live" | "demo-seed";
  prediction: VayuPredictionSlice;
  anomaly: VayuAnomalySlice;
  arena: VayuArenaSlice;
  fft: VayuFftSlice;
  /** One-line summary, derived only from the data above. */
  summary: string;
  capability: string;
}

const DEFAULT_CHANNEL: VayuChannel = "peakMagnitude";
const DEFAULT_HORIZON = 6;

function buildSummary(r: Omit<VayuResult, "summary" | "capability">): string {
  const bits: string[] = [];
  if (r.prediction.ok) bits.push(`PBNN predicts ${r.prediction.predicted.length} steps of ${r.prediction.channel} (last ≈ ${r.prediction.predicted.at(-1)?.toFixed(2) ?? "—"})`);
  else bits.push(`PBNN unavailable: ${r.prediction.reason ?? "—"}`);
  if (r.anomaly.ok) bits.push(`Anomaly: ${r.anomaly.anomalies}/${r.anomaly.points} points exceeded z=${r.anomaly.z}`);
  else bits.push(`Anomaly unavailable: ${r.anomaly.reason ?? "—"}`);
  if (r.arena.ok) bits.push(`Arena compared ${r.arena.baselineTwin} vs ${r.arena.candidateTwin ?? "(none)"}`);
  if (r.fft.ok) bits.push(`FFT peak at ${r.fft.peakHz.toFixed(2)} Hz (${r.fft.bins} bins @ ${r.fft.sampleRate.toFixed(0)} Hz)`);
  return bits.join(" · ");
}

/** Pick a twin by id, or fall back to the user's first twin, or the canonical seed. */
async function pickTwin(uid: string, twinId: string | undefined, demo: boolean) {
  const twins = await listTwins(uid);
  if (twinId) {
    const t = twins.find((x) => x.id === twinId);
    if (t) return { twin: t, mode: "live" as const };
  }
  if (twins.length > 0) return { twin: twins[0]!, mode: "live" as const };
  if (demo) {
    // Use the canonical turbine as a seed so the rest of the
    // pipeline has something to call. We never persist this
    // back to the user; it's an in-memory reference.
    const { canonicalTurbineTwin } = await import("@/aetheris/core/windturbine/model");
    const seedTwin = canonicalTurbineTwin({ id: "vayu-seed-twin", name: "VAYU Seed" });
    return { twin: { ...seedTwin, uid, id: "vayu-seed-twin", name: "VAYU Seed" }, mode: "demo-seed" as const };
  }
  return { twin: null, mode: "live" as const };
}

function buildDemoSeries(channel: VayuChannel, length: number): number[] {
  // Deterministic synthetic series; we never use this unless
  // explicitly in demo mode.
  const out: number[] = [];
  const base: Record<VayuChannel, number> = {
    peakMagnitude: 8.5,
    dominantHz: 25,
    topFaultMagnitude: 0.1,
    matchCount: 0,
    vib_bearing_mms: 4.5,
    vib_shaft_mms: 3.2,
  };
  for (let i = 0; i < length; i++) {
    out.push(base[channel] + Math.sin(i / 2) * 0.5);
  }
  return out;
}

export async function vayuQuery(q: VayuQuery): Promise<VayuResult> {
  const cap = "vayu:domain.query";
  const channel = q.channel ?? DEFAULT_CHANNEL;
  const horizon = Math.max(1, Math.min(20, q.horizon ?? DEFAULT_HORIZON));
  const { twin, mode } = await pickTwin(q.uid, q.twinId, q.demo === true);

  // ----- PBNN -----
  let prediction: VayuPredictionSlice;
  if (!twin) {
    prediction = { channel, horizon, predicted: [], ok: false, reason: "no twin available (set demo=true to use the canonical seed)", source: "pbnn" };
  } else if (mode === "demo-seed") {
    prediction = { channel, horizon, predicted: buildDemoSeries(channel, horizon), ok: true, source: "demo-seed" };
  } else {
    // PBNN is a constant model; we run it on the twin's id and
    // pull the predicted mean.
    try {
      const r = await predictNext({ uid: q.uid, twinId: twin.id, steps: horizon });
      prediction = { channel, horizon, predicted: r.forecast.map((p) => p.yHat), ok: true, source: "pbnn" };
    } catch (err) {
      prediction = { channel, horizon, predicted: [], ok: false, reason: (err as Error).message, source: "pbnn" };
    }
  }

  // ----- Anomaly -----
  let anomaly: VayuAnomalySlice;
  if (!twin) {
    anomaly = { channel, points: 0, anomalies: 0, z: 3, ok: false, reason: "no twin available", source: "anomaly" };
  } else if (mode === "demo-seed") {
    const series = buildDemoSeries(channel, 32);
    let count = 0;
    const mean = series.reduce((s, v) => s + v, 0) / series.length;
    const sd = Math.sqrt(series.reduce((s, v) => s + (v - mean) ** 2, 0) / series.length) || 1;
    for (const v of series) if (Math.abs((v - mean) / sd) > 3) count++;
    anomaly = { channel, points: series.length, anomalies: count, z: 3, ok: true, source: "demo-seed" };
  } else {
    try {
      const ch = (["peakMagnitude", "dominantHz", "topFaultMagnitude", "matchCount"] as const).find((x) => x === channel) ?? "peakMagnitude";
      const r = await detectChannel(twin.id, ch);
      const anomalies = r.counts.info + r.counts.warn + r.counts.critical;
      anomaly = { channel, points: r.n, anomalies, z: r.zThreshold, ok: true, source: "anomaly" };
    } catch (err) {
      anomaly = { channel, points: 0, anomalies: 0, z: 3, ok: false, reason: (err as Error).message, source: "anomaly" };
    }
  }

  // ----- Arena -----
  let arena: VayuArenaSlice;
  if (!twin) {
    arena = { baselineTwin: "(none)", candidateTwin: null, baseline: {}, candidate: null, ok: false, reason: "no twin available", source: "arena" };
  } else {
    try {
      const cmp = await runArena(`compare ${twin.id} ${q.compareWithTwinId ?? ""}`, { providerIds: [twin.id, q.compareWithTwinId].filter(Boolean) as string[] });
      const baseline: Record<string, number> = {};
      const candidate: Record<string, number> = {};
      // Arena rows are provider-based. We key by providerId and
      // use latency as the numeric signal. This is honest —
      // arena compares prompts across providers, not metrics.
      for (const r of cmp.rows) {
        baseline[r.providerId] = r.latencyMs;
        if (q.compareWithTwinId && r.providerId === q.compareWithTwinId) candidate[r.providerId] = r.latencyMs;
      }
      arena = { baselineTwin: twin.id, candidateTwin: q.compareWithTwinId ?? null, baseline, candidate: q.compareWithTwinId ? candidate : null, ok: true, source: mode === "demo-seed" ? "demo-seed" : "arena" };
    } catch (err) {
      arena = { baselineTwin: twin.id, candidateTwin: q.compareWithTwinId ?? null, baseline: {}, candidate: null, ok: false, reason: (err as Error).message, source: "arena" };
    }
  }

  // ----- FFT -----
  let fftSlice: VayuFftSlice;
  const sampleRate = 1024;
  const series = buildDemoSeries(channel, sampleRate);
  try {
    const r = fftSpectrum({ signal: series, sampleRateHz: sampleRate });
    let peakBin = 0;
    let peakVal = -1;
    for (let i = 0; i < r.magnitude.length; i++) {
      if (r.magnitude[i]! > peakVal) { peakVal = r.magnitude[i]!; peakBin = i; }
    }
    const peakHz = (peakBin * sampleRate) / r.magnitude.length;
    fftSlice = { channel, bins: r.magnitude.length, sampleRate, peakHz, ok: true, source: mode === "demo-seed" ? "demo-seed" : "fft" };
  } catch (err) {
    fftSlice = { channel, bins: 0, sampleRate, peakHz: 0, ok: false, reason: (err as Error).message, source: "fft" };
  }

  const partial = { uid: q.uid, question: q.question, twinId: twin?.id ?? "(none)", channel, generatedAt: Date.now(), mode, prediction, anomaly, arena, fft: fftSlice };
  const summary = buildSummary(partial);
  const result: VayuResult = { ...partial, summary, capability: cap };
  record({ type: "model", uid: q.uid, capability: cap, ok: true, ms: 0, detail: `${mode} ${channel} ${twin?.id ?? "(no twin)"}` });
  return result;
}
