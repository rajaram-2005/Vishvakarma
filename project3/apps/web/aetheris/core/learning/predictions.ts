/**
 * PBNN Prediction Graph.
 *
 *   A read-side helper that turns the production PBNN model
 *   into a forecast over the next N steps. The model is read
 *   from the production `learning:<uid>` store, features are
 *   constructed from the twin's actual state, and the forecast
 *   is the model's `predict()` plus a ±1.96σ band.
 *
 *   This is a real read of the production model — the helper
 *   does not fit anything; it only consumes the model. The page
 *   shows the forecast alongside the historical data, so the
 *   user can audit divergence.
 */

import { store } from "@/aetheris/lib/store";
import { getHistory } from "@/aetheris/core/diagnostics/history";
import { predict, type PbnnLinear } from "@/aetheris/core/learning/pbnn";
import { getTwin, type Twin } from "@/aetheris/core/twins/twins";

export interface PredictionPoint {
  step: number;
  yHat: number;
  /** 1.96σ lower bound. */
  lo: number;
  /** 1.96σ upper bound. */
  hi: number;
}

export interface PredictionReport {
  uid: string;
  twinId: string;
  /** The model that produced the forecast. */
  model: PbnnLinear | null;
  /** The features the model uses. */
  features: string[];
  /** The target the model predicts. */
  target: string;
  /** History points (the actual data the model was fit on). */
  history: { tMs: number; y: number }[];
  /** Forecast points (next N). */
  forecast: PredictionPoint[];
  /** Divergence metric: mean |y - yHat| on the last 5 history points. */
  recentDivergence: number | null;
  /** When the forecast was assembled. */
  assembledAt: number;
}

interface StoredModel { uid: string; model: PbnnLinear; features: string[]; target: string; twinId: string; trainedOn: number; updatedAt: number }

const COLLECTION = "learning";

async function loadModel(uid: string, twinId: string): Promise<StoredModel | null> {
  const k = `pbnn:${twinId}`;
  const m = await store.get<StoredModel>(COLLECTION, k);
  if (!m) return null;
  if (m.uid && m.uid !== uid) return null;
  return m;
}

function makeFeatures(twin: Twin, spec: StoredModel): number[] {
  return spec.features.map((f) => {
    if (f === "const") return 1;
    if (f === "step") return 0; // re-set per step
    if (f === "rotor_rpm") return Number(twin.state.rotor_rpm ?? 0);
    if (f === "vib_bearing_mms") return Number(twin.state.vib_bearing_mms ?? 0);
    if (f === "T_gearbox_K") return Number(twin.state.T_gearbox_K ?? 0);
    if (f === "P_active_kW") return Number(twin.state.P_active_kW ?? 0);
    if (f === "wind_speed_ms") return Number(twin.state.wind_speed_ms ?? 0);
    return Number((twin.state as Record<string, unknown>)[f] ?? 0);
  });
}

export async function predictNext(opts: { uid: string; twinId: string; steps?: number }): Promise<PredictionReport> {
  const steps = opts.steps ?? 10;
  const twin = await getTwin(opts.twinId);
  const model = await loadModel(opts.uid, opts.twinId);
  if (!twin || !model) {
    return {
      uid: opts.uid, twinId: opts.twinId, model: null, features: [], target: "—",
      history: [], forecast: [], recentDivergence: null, assembledAt: Date.now(),
    };
  }
  // History from the diagnostic channel — only peak magnitude is
  // a uniform numeric channel that matches every twin.
  const historyRows = await getHistory(opts.twinId, { limit: 30 });
  const history = [...historyRows].reverse().map((h) => ({ tMs: h.tMs, y: h.peakMagnitude }));
  // Build the feature vector: copy from the current state and
  // override "step" for each forecast step.
  const baseFeatures = makeFeatures(twin, model);
  const stepIdx = model.features.indexOf("step");
  const forecast: PredictionPoint[] = [];
  for (let s = 1; s <= steps; s++) {
    const x = baseFeatures.slice();
    if (stepIdx >= 0) x[stepIdx] = history.length + s;
    try {
      const p = predict(model.model, x);
      const k = 1.96 * p.sigma;
      forecast.push({ step: history.length + s, yHat: p.yHat, lo: p.yHat - k, hi: p.yHat + k });
    } catch {
      forecast.push({ step: history.length + s, yHat: Number.NaN, lo: Number.NaN, hi: Number.NaN });
    }
  }
  // Recent divergence
  const recent5 = history.slice(-5);
  let recentDivergence: number | null = null;
  if (recent5.length > 0 && stepIdx >= 0) {
    let sum = 0; let n = 0;
    for (let i = 0; i < recent5.length; i++) {
      const x = baseFeatures.slice();
      x[stepIdx] = history.length - recent5.length + i + 1;
      try {
        const p = predict(model.model, x);
        sum += Math.abs(recent5[i]!.y - p.yHat);
        n++;
      } catch { /* skip */ }
    }
    if (n > 0) recentDivergence = sum / n;
  }
  return {
    uid: opts.uid,
    twinId: opts.twinId,
    model: model.model,
    features: model.features,
    target: model.target,
    history,
    forecast,
    recentDivergence,
    assembledAt: Date.now(),
  };
}

export async function listLearnedModels(uid: string): Promise<{ twinId: string; trainedOn: number; updatedAt: number; features: string[]; target: string }[]> {
  const all = await store.all<StoredModel>(COLLECTION);
  const out: { twinId: string; trainedOn: number; updatedAt: number; features: string[]; target: string }[] = [];
  for (const [, v] of Object.entries(all)) {
    if (v.uid && v.uid !== uid) continue;
    out.push({ twinId: v.twinId, trainedOn: v.trainedOn, updatedAt: v.updatedAt, features: v.features, target: v.target });
  }
  return out;
}
