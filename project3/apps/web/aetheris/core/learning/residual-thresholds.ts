/**
 * Anomaly thresholds from PBNN residuals.
 *
 *   The PBNN model fits a constant mean on the chosen
 *   channel. Its `sigma2` is the residual variance, learned
 *   from the user's own history. We expose three anomaly
 *   bands as multiples of the residual standard deviation:
 *
 *     watch    = mean ± 1.5·sigma
 *     warning  = mean ± 2.5·sigma
 *     critical = mean ± 3.5·sigma
 *
 *   These are the same k values as the diagnostics
 *   thresholds (k.watch / k.warning / k.critical), so the
 *   two views agree.
 *
 *   If the user has not yet trained a model, the function
 *   returns ok=false. We do not invent a sigma.
 */

import { getHistory } from "@/aetheris/core/diagnostics/history";
import { store } from "@/aetheris/lib/store";
import { getTwin } from "@/aetheris/core/twins/twins";
import type { PbnnLinear } from "@/aetheris/core/learning/pbnn";

const MODEL_COLLECTION = "learning";

export type AnomalyBand = "ok" | "watch" | "warning" | "critical";

export interface ResidualThreshold {
  channel: string;
  target: string;
  twinId: string;
  mean: number;
  sigma: number;
  sigma2: number;
  trainedOn: number;
  n: number;
  watch: number;
  warning: number;
  critical: number;
  k: { watch: number; warning: number; critical: number };
}

export interface ResidualThresholds {
  ok: boolean;
  reason?: string;
  twinId: string;
  generatedAt: number;
  k: { watch: number; warning: number; critical: number };
  channels: ResidualThreshold[];
}

const DEFAULTS = { watch: 1.5, warning: 2.5, critical: 3.5 };

async function loadModel(uid: string, twinId: string): Promise<PbnnLinear | null> {
  const k = `pbnn:${twinId}`;
  const m = await store.get<{ uid: string; model: PbnnLinear; twinId: string }>(MODEL_COLLECTION, k);
  if (!m) return null;
  if (m.uid !== uid) return null;
  return m.model;
}

function buildThresholds(twinId: string, model: PbnnLinear, k: { watch: number; warning: number; critical: number }, target: string, n: number): ResidualThreshold {
  const mean = model.bias;
  const sigma = Math.sqrt(model.sigma2);
  return {
    channel: target,
    target,
    twinId,
    mean,
    sigma,
    sigma2: model.sigma2,
    trainedOn: model.trainedOn,
    n,
    watch: mean + k.watch * sigma,
    warning: mean + k.warning * sigma,
    critical: mean + k.critical * sigma,
    k,
  };
}

export async function residualThresholds(uid: string, twinId: string, opts: { k?: Partial<{ watch: number; warning: number; critical: number }>; target?: string } = {}): Promise<ResidualThresholds> {
  const k = { ...DEFAULTS, ...(opts.k ?? {}) };
  const target = opts.target ?? "peakMagnitude";
  const twin = await getTwin(twinId);
  if (!twin) return { ok: false, reason: "twin not found", twinId, generatedAt: Date.now(), k, channels: [] };
  const model = await loadModel(uid, twinId);
  if (!model) return { ok: false, reason: "no PBNN model trained for this twin — run /learning to train one", twinId, generatedAt: Date.now(), k, channels: [] };
  const hist = await getHistory(twinId, { limit: 1 });
  return { ok: true, twinId, generatedAt: Date.now(), k, channels: [buildThresholds(twinId, model, k, target, hist.length)] };
}

export function classifyResidual(t: ResidualThreshold, value: number): AnomalyBand {
  const dev = Math.abs(value - t.mean);
  if (dev >= t.critical - t.mean) return "critical";
  if (dev >= t.warning - t.mean) return "warning";
  if (dev >= t.watch - t.mean) return "watch";
  return "ok";
}
