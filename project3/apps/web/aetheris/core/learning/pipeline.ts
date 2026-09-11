/**
 * Continuous training pipeline — a thin state machine that keeps a PBNN in sync with
 * live telemetry.
 *
 *   The agent's memory core exposes this pipeline as a "skill" that the planner can
 *   schedule: every N seconds, or whenever a new batch is pushed, the model is updated.
 *
 *   Anti-forgetting:
 *     - We keep the Bayesian prior sticky: when fitting, the posterior becomes the next
 *       prior, so the model converges but does not jump on a single noisy batch.
 *     - The data batch is windowed (last K rows per feature stream) so old data does
 *       not dominate the cost.
 *
 *   The pipeline is *not* a queue worker. The caller decides when to call `tick`. That
 *   makes it easy to test deterministically and easy to back-pressure from a busy
 *   system.
 */

import { record } from "../observability/events";
import { fitLinear, predict, PbnnLinear, PbnnSpec, physicsResidual } from "./pbnn";

export interface FeatureStream { name: string; values: number[]; /** monotonic timestamps; we just need length parity */ at: number[] }
export interface PipelineConfig {
  spec: PbnnSpec;
  /** Max rows per stream kept in memory for the next fit. */
  windowSize?: number;
  /** Re-fit at most every minIntervalMs. Set 0 to refit on every tick. */
  minIntervalMs?: number;
  /** If the residual on a single prediction exceeds this, emit a `drift` event. */
  driftResidual?: number;
}

export interface PipelineState {
  model: PbnnLinear | null;
  lastFitAt: number;
  lastResidual: number | null;
  fits: number;
  rows: number;
  driftEvents: number;
}

export class PbnnPipeline {
  private streams = new Map<string, FeatureStream>();
  private cfg: PipelineConfig;
  private state: PipelineState = { model: null, lastFitAt: 0, lastResidual: null, fits: 0, rows: 0, driftEvents: 0 };
  constructor(cfg: PipelineConfig) { this.cfg = { windowSize: 200, minIntervalMs: 1000, driftResidual: 3, ...cfg }; }

  /** Push a fresh telemetry row. The `target` is paired to the timestamp of the last feature. */
  push(at: number, features: Record<string, number>, target: number) {
    for (const f of this.cfg.spec.features) {
      let s = this.streams.get(f);
      if (!s) { s = { name: f, values: [], at: [] }; this.streams.set(f, s); }
      s.values.push(features[f]);
      s.at.push(at);
    }
    let s = this.streams.get("__target__");
    if (!s) { s = { name: "__target__", values: [], at: [] }; this.streams.set("__target__", s); }
    s.values.push(target);
    s.at.push(at);
    for (const stream of this.streams.values()) {
      const max = this.cfg.windowSize ?? 200;
      if (stream.values.length > max) { stream.values = stream.values.slice(-max); stream.at = stream.at.slice(-max); }
    }
  }

  /**
   * Trigger a fit if enough time has passed. Returns the latest model and a brief
   * summary; never throws — a failed fit keeps the previous model and reports the
   * reason. `force` skips the time gate (used by tests and by a manual retrain button).
   */
  tick(opts: { uid?: string; force?: boolean } = {}): { model: PbnnLinear | null; trained: boolean; reason?: string; state: PipelineState } {
    const now = Date.now();
    const minInterval = this.cfg.minIntervalMs ?? 1000;
    if (!opts.force && now - this.state.lastFitAt < minInterval) return { model: this.state.model, trained: false, reason: "min_interval", state: this.state };
    const target = this.streams.get("__target__");
    if (!target || target.values.length < 2) return { model: this.state.model, trained: false, reason: "not_enough_data", state: this.state };
    const n = target.values.length;
    const rows: { x: number[]; y: number }[] = [];
    for (let i = 0; i < n; i++) {
      const x: number[] = [];
      let ok = true;
      for (const f of this.cfg.spec.features) {
        const s = this.streams.get(f);
        const v = s?.values[i];
        if (v === undefined || !Number.isFinite(v)) { ok = false; break; }
        x.push(v);
      }
      const y = target.values[i];
      if (!ok || !Number.isFinite(y)) continue;
      rows.push({ x, y });
    }
    if (rows.length < 2) return { model: this.state.model, trained: false, reason: "not_enough_valid_rows", state: this.state };
    try {
      const t0 = Date.now();
      const model = fitLinear(rows, this.cfg.spec, this.state.model ?? undefined);
      this.state = { ...this.state, model, lastFitAt: now, fits: this.state.fits + 1, rows: this.state.rows + rows.length };
      // Physics check on the most recent row.
      const last = rows[rows.length - 1];
      const r = physicsResidual(model, this.cfg.spec, last.x);
      if (r && r.residual > (this.cfg.driftResidual ?? 3)) {
        this.state.driftEvents++;
        record({ type: "agent", uid: opts.uid, capability: "system:pbnn", ok: false, detail: `physics residual ${r.residual.toFixed(3)} on ${r.name} exceeds threshold`, meta: { feature: r.name, residual: r.residual } });
      }
      this.state.lastResidual = r?.residual ?? null;
      record({ type: "agent", uid: opts.uid, capability: "system:pbnn", ok: true, ms: Date.now() - t0, detail: `PBNN fit on ${rows.length} rows (target=${this.cfg.spec.target})`, meta: { fits: this.state.fits, trainedOn: model.trainedOn, sigma2: model.sigma2 } });
      return { model, trained: true, state: this.state };
    } catch (e) {
      record({ type: "agent", uid: opts.uid, capability: "system:pbnn", ok: false, detail: `PBNN fit failed: ${(e as Error).message}` });
      return { model: this.state.model, trained: false, reason: (e as Error).message, state: this.state };
    }
  }

  /** Predict with the latest model. Returns null if the model is not trained yet. */
  predict(x: Record<string, number>): { yHat: number; sigma: number } | null {
    if (!this.state.model) return null;
    const xa = this.cfg.spec.features.map((f) => x[f]);
    if (xa.some((v) => !Number.isFinite(v))) return null;
    return predict(this.state.model, xa);
  }

  /** Read-only state for a UI panel. */
  getState(): PipelineState { return this.state }
  getSpec(): PbnnSpec { return this.cfg.spec }
}

// --------------------------------------------------------------------------- registry (in-memory, per process)

const pipelines = new Map<string, PbnnPipeline>();

/** Get or create a pipeline by id. Pipelines are process-local; persistence is the caller's job. */
export function getPipeline(id: string, cfg: PipelineConfig): PbnnPipeline {
  let p = pipelines.get(id);
  if (!p) { p = new PbnnPipeline(cfg); pipelines.set(id, p); }
  return p;
}

export function listPipelines() { return [...pipelines.entries()].map(([id, p]) => ({ id, spec: p.getSpec(), state: p.getState() })) }
