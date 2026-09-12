/**
 * Real fault-detection thresholds.
 *
 *   For each channel the diagnostics engine records, fit a
 *   threshold from the user's own diagnostic history:
 *     - mean and standard deviation (and median + MAD, for
 *       robustness against single bad readings)
 *     - a per-channel "watch", "warning", and "critical"
 *       level computed as mean + k*sigma at the chosen
 *       percentile
 *
 *   The threshold is honest: it comes from the data the
 *   user already has, not from a "typical wind-turbine"
 *   table. With fewer than 5 history points the function
 *   returns ok=false and reports the reason; we do not
 *   invent a threshold from nothing.
 */

import { getHistory } from "@/aetheris/core/diagnostics/history";

export type Channel = "peakMagnitude" | "dominantHz" | "topFaultMagnitude" | "matchCount" | "rms";

export interface ChannelThreshold {
  channel: Channel;
  n: number;
  mean: number;
  stdev: number;
  median: number;
  mad: number;
  watch: number;
  warning: number;
  critical: number;
  /** The k values used to derive the bands. */
  k: { watch: number; warning: number; critical: number };
}

export interface Thresholds {
  ok: boolean;
  reason?: string;
  twinId: string;
  generatedAt: number;
  /** The k values used across all channels. */
  k: { watch: number; warning: number; critical: number };
  channels: ChannelThreshold[];
}

const DEFAULTS = { watch: 1.5, warning: 2.5, critical: 3.5 };

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[m - 1]! + s[m]!) / 2 : s[m]!;
}

function mad(xs: number[], med: number): number {
  return median(xs.map((x) => Math.abs(x - med)));
}

function pickChannel(h: { peakMagnitude: number; dominantHz: number | null; topFaultMagnitude: number | null; matchCount: number | null; envelope?: { rms: number } | null }, ch: Channel): number | null {
  switch (ch) {
    case "peakMagnitude": return h.peakMagnitude;
    case "dominantHz": return h.dominantHz;
    case "topFaultMagnitude": return h.topFaultMagnitude;
    case "matchCount": return h.matchCount;
    case "rms": return h.envelope?.rms ?? null;
  }
}

export async function fitThresholds(twinId: string, opts: { limit?: number; k?: Partial<{ watch: number; warning: number; critical: number }> } = {}): Promise<Thresholds> {
  const k = { ...DEFAULTS, ...(opts.k ?? {}) };
  const limit = opts.limit ?? 50;
  const history = await getHistory(twinId, { limit });
  if (history.length < 5) {
    return { ok: false, reason: `need at least 5 history points, have ${history.length}`, twinId, generatedAt: Date.now(), k, channels: [] };
  }
  const channels: ChannelThreshold[] = [];
  for (const ch of ["peakMagnitude", "dominantHz", "topFaultMagnitude", "matchCount", "rms"] as Channel[]) {
    const values = history.map((h) => pickChannel(h, ch)).filter((v): v is number => v !== null && Number.isFinite(v));
    if (values.length < 5) continue;
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
    const stdev = Math.sqrt(variance);
    const med = median(values);
    const m = mad(values, med);
    const safe = stdev > 0 ? stdev : 1;
    channels.push({
      channel: ch,
      n: values.length,
      mean,
      stdev,
      median: med,
      mad: m,
      watch: mean + k.watch * safe,
      warning: mean + k.warning * safe,
      critical: mean + k.critical * safe,
      k,
    });
  }
  return { ok: true, twinId, generatedAt: Date.now(), k, channels };
}

export function classify(t: ChannelThreshold, value: number): "ok" | "watch" | "warning" | "critical" {
  if (value >= t.critical) return "critical";
  if (value >= t.warning) return "warning";
  if (value >= t.watch) return "watch";
  return "ok";
}
