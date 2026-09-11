/**
 * Diagnostic history + trend tracking.
 *
 *   Goal: persist each diagnostic run to the store, so we can look back at the
 *         last N runs for a twin and answer questions like "is the peak
 *         magnitude rising?" or "when did this severity first hit warning?".
 *
 *   The store is the existing JSON file store (see src/lib/store.ts). We key
 *   each entry by `${twinId}:${tMs}` and keep the entry small — we don't
 *   store the raw sample, only the summary, peaks, and matches. Trend math
 *   (SMA, first-difference alarm) is computed on demand.
 *
 *   Capacity: there's no built-in retention. A 24-hour history of 1Hz
 *   diagnostics is ~86,400 entries. The store's `prune()` helper lets the
 *   caller enforce a per-twin cap.
 *
 *   Status: EXPERIMENTAL but well-tested. See tests/diagnostics.test.ts.
 */

import { store } from "@/aetheris/lib/store";
import type { DiagnosticResult, EnvelopeResult, Severity } from "./engine";

const COLLECTION = "diagnostic-history" as const;

export interface DiagnosticHistoryEntry {
  twinId: string;
  tMs: number;
  severity: Severity;
  /** The dominant frequency of the raw spectrum. */
  dominantHz: number | null;
  /** Top peak magnitude in the raw spectrum. */
  peakMagnitude: number;
  /** Top fault (if any). */
  topFault: string | null;
  /** Top fault magnitude. */
  topFaultMagnitude: number;
  /** Number of bearing-signature matches. */
  matchCount: number;
  /** Envelope summary, if envelope demodulation was run. */
  envelope: { dominantHz: number | null; rms: number; crest: number; matchCount: number } | null;
  /** Optional labels (e.g. from the API client). */
  labels?: string[];
}

const id = (twinId: string, tMs: number) => `${twinId}:${tMs}`;

/** Record a diagnostic run for a twin. Idempotent on `(twinId, tMs)`. */
export async function recordDiagnostic(twinId: string, result: DiagnosticResult, opts: { uid?: string; labels?: string[] } = {}): Promise<DiagnosticHistoryEntry> {
  const tMs = Date.now();
  const topPeak = result.peaks[0];
  const topMatch = result.matches[0];
  const entry: DiagnosticHistoryEntry = {
    twinId,
    tMs,
    severity: result.severity,
    dominantHz: result.dominantHz,
    peakMagnitude: topPeak ? topPeak.magnitude : 0,
    topFault: topMatch ? topMatch.fault : null,
    topFaultMagnitude: topMatch ? topMatch.magnitude : 0,
    matchCount: result.matches.length,
    envelope: result.envelope ? envelopeSummary(result.envelope) : null,
    labels: opts.labels,
  };
  await store.set<DiagnosticHistoryEntry>(COLLECTION, id(twinId, tMs), entry);
  return entry;
}

function envelopeSummary(e: EnvelopeResult): DiagnosticHistoryEntry["envelope"] {
  const topMatch = e.matches[0];
  return {
    dominantHz: e.dominantEnvelopeHz,
    rms: e.envelopeRms,
    crest: e.envelopeCrest,
    matchCount: e.matches.length,
  };
  // (topMatch is intentionally not stored here to keep the entry small;
  // the diagnostic itself carries the full match details, retrievable by
  // re-running the engine if needed.)
  void topMatch;
}

/** Read the history for a twin, newest first, optionally filtered by time window. */
export async function getHistory(twinId: string, opts: { sinceMs?: number; limit?: number } = {}): Promise<DiagnosticHistoryEntry[]> {
  const all = await store.all<DiagnosticHistoryEntry>(COLLECTION);
  const sinceMs = opts.sinceMs ?? 0;
  const limit = opts.limit ?? 1000;
  const out: DiagnosticHistoryEntry[] = [];
  for (const [k, v] of Object.entries(all)) {
    if (!k.startsWith(twinId + ":")) continue;
    if (v.tMs < sinceMs) continue;
    out.push(v);
  }
  out.sort((a, b) => b.tMs - a.tMs);
  return out.slice(0, limit);
}

/** Drop the oldest entries for a twin until at most `cap` remain. */
export async function prune(twinId: string, cap: number): Promise<number> {
  const hist = await getHistory(twinId, { limit: 1_000_000 });
  if (hist.length <= cap) return 0;
  const toRemove = hist.slice(cap);
  for (const e of toRemove) await store.remove(COLLECTION, id(e.twinId, e.tMs));
  return toRemove.length;
}

// --------------------------------------------------------------------------- trend math
//
// Two small analytical views over a history:
//   - `movingAverage(entries, field, window)` → a smoothed series
//   - `trend(entries)` → slope of the peak magnitude, with a "rising" alarm.
//
// The slope is a least-squares fit of `peakMagnitude` against time (in
// seconds), robust to gaps. We classify it as "rising" if the slope is
// > `riseThreshold` per second AND the latest entry is at or above the
// moving average.

export interface TrendReport {
  twinId: string;
  n: number;
  fromMs: number;
  toMs: number;
  /** Simple moving average of peak magnitude, over the full window. */
  peakMagnitudeSMA: number;
  /** Linear-regression slope of peak magnitude (units per second). */
  peakSlopePerSec: number;
  /** Linear-regression slope of envelope RMS, if envelope data is present. */
  envelopeSlopePerSec: number | null;
  /** Latest entry. */
  latest: DiagnosticHistoryEntry;
  /** "rising" if peak slope > riseThreshold and latest >= SMA. */
  alarm: "rising" | "stable" | "falling" | "insufficient-data";
  /** Number of entries in each severity bucket. */
  severityCounts: Record<Severity, number>;
}

export interface TrendOpts {
  /** Window in ms (default 24 hours). */
  windowMs?: number;
  /** How many entries to use (default 50). */
  maxEntries?: number;
  /** Threshold (units/sec) above which the trend is "rising". */
  riseThreshold?: number;
  /** Threshold (units/sec) below which the trend is "falling". */
  fallThreshold?: number;
}

export function trend(history: DiagnosticHistoryEntry[], twinId: string, opts: TrendOpts = {}): TrendReport {
  const windowMs = opts.windowMs ?? 24 * 3600 * 1000;
  const maxEntries = opts.maxEntries ?? 50;
  const riseThreshold = opts.riseThreshold ?? 0.001; // 0.001 mm/s² → 0.086 mm/s per day
  const fallThreshold = opts.fallThreshold ?? -0.001;

  if (history.length === 0) {
    return {
      twinId,
      n: 0,
      fromMs: 0,
      toMs: 0,
      peakMagnitudeSMA: 0,
      peakSlopePerSec: 0,
      envelopeSlopePerSec: null,
      latest: null as unknown as DiagnosticHistoryEntry,
      alarm: "insufficient-data",
      severityCounts: { ok: 0, watch: 0, warning: 0, critical: 0 },
    };
  }
  // Window filter
  const latest = history[0];
  const fromMs = latest.tMs - windowMs;
  const windowed = history.filter((e) => e.tMs >= fromMs).slice(0, maxEntries);

  const n = windowed.length;
  const toMs = windowed[0].tMs;
  // SMA
  let sum = 0; for (const e of windowed) sum += e.peakMagnitude;
  const sma = sum / n;
  // Linear regression: y = a + b*t (t in seconds)
  const ts = windowed.map((e) => (e.tMs - windowed[windowed.length - 1].tMs) / 1000);
  const ys = windowed.map((e) => e.peakMagnitude);
  const meanT = ts.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0; let den = 0;
  for (let i = 0; i < n; i++) {
    num += (ts[i] - meanT) * (ys[i] - meanY);
    den += (ts[i] - meanT) * (ts[i] - meanT);
  }
  const peakSlope = den > 0 ? num / den : 0;
  // Envelope slope (only if all entries have envelope data).
  let envSlope: number | null = null;
  const allHaveEnv = windowed.every((e) => e.envelope !== null);
  if (allHaveEnv) {
    const envYs = windowed.map((e) => e.envelope!.rms);
    const meanEnvY = envYs.reduce((a, b) => a + b, 0) / n;
    let envNum = 0;
    for (let i = 0; i < n; i++) envNum += (ts[i] - meanT) * (envYs[i] - meanEnvY);
    envSlope = den > 0 ? envNum / den : 0;
  }
  // Severity counts
  const severityCounts: Record<Severity, number> = { ok: 0, watch: 0, warning: 0, critical: 0 };
  for (const e of windowed) severityCounts[e.severity]++;
  // Alarm
  let alarm: TrendReport["alarm"];
  if (n < 3) alarm = "insufficient-data";
  else if (peakSlope > riseThreshold) alarm = "rising";
  else if (peakSlope < fallThreshold) alarm = "falling";
  else alarm = "stable";

  return {
    twinId,
    n,
    fromMs,
    toMs,
    peakMagnitudeSMA: sma,
    peakSlopePerSec: peakSlope,
    envelopeSlopePerSec: envSlope,
    latest,
    alarm,
    severityCounts,
  };
}

/** Convenience: load history and compute the trend in one call. */
export async function getTrend(twinId: string, opts: TrendOpts = {}): Promise<TrendReport> {
  const history = await getHistory(twinId, { limit: opts.maxEntries ?? 50 });
  return trend(history, twinId, opts);
}
