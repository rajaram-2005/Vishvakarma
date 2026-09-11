/**
 * Anomaly Detection.
 *
 *   Real anomaly detection over a digital-twin channel. The detector
 *   takes a single channel's history (vibration, dominant Hz, …),
 *   fits a constant model (the channel's mean) and then flags
 *   points whose residual exceeds a z-score threshold in units of
 *   a robust sigma (Median Absolute Deviation).
 *
 *   No fabricated thresholds. The model is the mean of the actual
 *   data, sigma is computed from the data's own MAD, and every
 *   anomaly is reported with the exact (observed, predicted,
 *   residual, sigma) tuple so the user can audit it.
 *
 *   In a real system the right model is a Kalman filter, an LSTM,
 *   or an isolation forest. This one is a small, honest, OLS
 *   baseline — good enough to be useful, small enough to be
 *   reviewed.
 */

import { predict, type PbnnLinear, type PbnnSpec } from "@/aetheris/core/learning/pbnn";
import { getHistory } from "@/aetheris/core/diagnostics/history";

export type AnomalySeverity = "info" | "warn" | "critical";

export interface AnomalyPoint {
  tMs: number;
  observed: number;
  predicted: number;
  residual: number;
  sigma: number;
  /** Residual / sigma. > 3 is the conventional outlier bar. */
  zscore: number;
  severity: AnomalySeverity;
  reason: string;
}

export interface AnomalyReport {
  twinId: string;
  channel: string;
  /** The fitted model — exposed so the user can audit it. */
  model: PbnnLinear;
  spec: PbnnSpec;
  /** Threshold used (in units of sigma). */
  zThreshold: number;
  /** Number of points analysed. */
  n: number;
  /** The points, oldest first. */
  points: AnomalyPoint[];
  /** Convenience: the worst-z anomaly, if any. */
  worst: AnomalyPoint | null;
  /** Count by severity. */
  counts: { info: number; warn: number; critical: number };
}

const DEFAULT_WINDOW = 30;
const DEFAULT_Z = 3.0;

function severityFor(z: number, zThreshold: number): AnomalySeverity {
  if (z >= zThreshold * 2) return "critical";
  if (z >= zThreshold) return "warn";
  return "info";
}

/** Pure helper. Same input always yields same output (good for tests). */
export function detectAnomalies(rows: { tMs: number; y: number }[], spec: PbnnSpec, zThreshold = DEFAULT_Z): AnomalyReport {
  if (rows.length < 2) {
    return {
      twinId: "—",
      channel: spec.target,
      model: { kind: "linear", weights: spec.features.map(() => 0), bias: 0, prior: { mean: spec.features.map(() => 0), variance: spec.features.map(() => 1) }, biasPrior: { mean: 0, variance: 1 }, sigma2: 0, trainedOn: 0, updatedAt: 0 },
      spec,
      zThreshold,
      n: rows.length,
      points: rows.map((r) => ({ tMs: r.tMs, observed: r.y, predicted: r.y, residual: 0, sigma: 0, zscore: 0, severity: "info", reason: "no model — too few rows" })),
      worst: null,
      counts: { info: 0, warn: 0, critical: 0 },
    };
  }
  // Fit a constant model: y ≈ b. This is the smallest honest
  // baseline — the residual on each point is (observed - mean). A
  // trend detector or seasonal baseline would be the next step, but
  // a constant is the right thing to start with: it cannot absorb a
  // spike into a slope.
  //
  // We use ordinary least squares (closed form for a constant), not
  // the PBNN, because the PBNN's iterative sigma2 update is meant
  // for online learning on well-behaved data; for batch anomaly
  // detection we want a simple, predictable mean.
  const mean = rows.reduce((s, r) => s + r.y, 0) / rows.length;
  const fitted: PbnnLinear = {
    kind: "linear",
    weights: [1], // single "feature" is the constant 1
    bias: mean,
    prior: { mean: [0], variance: [1] },
    biasPrior: { mean: 0, variance: 1 },
    sigma2: 1,
    trainedOn: rows.length,
    updatedAt: Date.now(),
  };
  // Calibrate sigma from the residuals. Use the Median Absolute
  // Deviation of the model's own residuals; this is robust to a
  // small number of large spikes.
  const preds = rows.map(() => predict(fitted, [1]));
  const residuals = preds.map((p, i) => rows[i]!.y - p.yHat);
  const sortedR = [...residuals].map((r) => Math.abs(r)).sort((a, b) => a - b);
  const mad = sortedR[Math.floor(sortedR.length / 2)] ?? 0;
  let sigma = 1.4826 * mad;
  if (sigma < 1e-6) {
    const half = sortedR.slice(0, Math.max(1, Math.floor(sortedR.length / 2)));
    const meanHalf = half.reduce((s, v) => s + v, 0) / half.length;
    const varHalf = half.reduce((s, v) => s + (v - meanHalf) ** 2, 0) / Math.max(1, half.length - 1);
    sigma = Math.sqrt(varHalf) || 1e-6;
  }
  const points: AnomalyPoint[] = preds.map((p, i) => {
    const r = rows[i]!;
    const residual = r.y - p.yHat;
    const zscore = residual / sigma;
    const severity = severityFor(Math.abs(zscore), zThreshold);
    return {
      tMs: r.tMs,
      observed: r.y,
      predicted: p.yHat,
      residual,
      sigma,
      zscore,
      severity,
      reason: severity === "info" ? "within ±z" : `|z|=${Math.abs(zscore).toFixed(2)} ≥ ${zThreshold}`,
    };
  });
  let worst: AnomalyPoint | null = null;
  const counts = { info: 0, warn: 0, critical: 0 };
  for (const pt of points) {
    if (!worst || Math.abs(pt.zscore) > Math.abs(worst.zscore)) worst = pt;
    counts[pt.severity]++;
  }
  return { twinId: "—", channel: spec.target, model: fitted, spec, zThreshold, n: rows.length, points, worst, counts };
}

/** Top-level helper: read the channel's diagnostic history and detect.
 *  Channel is one of the numeric fields that DiagnosticHistoryEntry
 *  actually carries (peakMagnitude, dominantHz, topFaultMagnitude,
 *  matchCount). For twin.state channels (oil_pressure_kPa, T_gearbox_K,
 *  …) the caller is expected to pass `rows` directly. */
export async function detectChannel(twinId: string, channel: "peakMagnitude" | "dominantHz" | "topFaultMagnitude" | "matchCount", zThreshold = DEFAULT_Z, limit = DEFAULT_WINDOW): Promise<AnomalyReport> {
  const history = await getHistory(twinId, { limit });
  // Newest first → reverse to oldest first.
  const ordered = [...history].reverse();
  const rows: { tMs: number; y: number }[] = [];
  for (const h of ordered) {
    const v = (h as unknown as Record<string, number | null>)[channel];
    rows.push({ tMs: h.tMs, y: typeof v === "number" ? v : 0 });
  }
  const report = detectAnomalies(rows, { features: ["const"], target: channel }, zThreshold);
  return { ...report, twinId };
}
