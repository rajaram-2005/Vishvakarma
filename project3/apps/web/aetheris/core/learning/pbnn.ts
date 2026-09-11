/**
 * Physics-Guided Bayesian Neural Network (PBNN) — a *lightweight* surrogate model.
 *
 *   Goal: let the agent learn a small, localised model of a physical subsystem from
 *         live telemetry, and use physical laws as a *soft penalty* in the loss so the
 *         model never predicts physically impossible values.
 *
 *   Reality check:
 *     - A real PBNN is a Bayesian neural net with a physics-informed prior; the
 *       "Bayesian" part is non-trivial in TypeScript. What we ship is a deliberately
 *       small, transparent approximation:
 *         • linear-Gaussian model: y_hat(x; w, b) = w · x + b   (with a 1-sigma band)
 *         • Gaussian prior on w whose mean is a *physics-derived* slope and variance
 *           encodes how confident we are in that law.
 *         • The "physics loss" is added to the data loss: a weighted penalty when the
 *           predicted values disagree with the constraint equation. That is the
 *           "physics-guided" part.
 *     - The agent can use this as a controller, a sanity-check on its own reasoning, or
 *       a drift detector. It is NOT a general-purpose ML library.
 *
 *   What it can do:
 *     - Fit a small model from CSV-like telemetry batches.
 *     - Predict with an uncertainty band.
 *     - Update on new batches (no full retrain; the prior is sticky).
 *     - Penalise predictions that violate a physics constraint at evaluation time.
 *
 *   What it cannot do (be honest):
 *     - Multi-layer / non-linear fits (deliberately).
 *     - GPU acceleration.
 *     - Streaming over millions of points (use the durable event log + a periodic retrain).
 *
 *   Status: EXPERIMENTAL. See tests/pbnn.test.ts for the contract.
 */

// --------------------------------------------------------------------------- model
export interface PbnnLinear {
  kind: "linear";
  /** Weight per input feature. Length = features.length. */
  weights: number[];
  bias: number;
  /** Per-feature Gaussian prior: mean + variance. The slope a physicist would expect. */
  prior: { mean: number[]; variance: number[] };
  /** Standard deviation on the bias prior. */
  biasPrior: { mean: number; variance: number };
  /** Noise variance (sigma^2) on the output, learned from residuals. */
  sigma2: number;
  /** Number of training rows the model has seen. */
  trainedOn: number;
  /** Wall-clock of last update. */
  updatedAt: number;
}

export interface PbnnSpec {
  features: string[];
  target: string;
  /** Physics prior on each feature's weight. If omitted, we fall back to 0 ± 1. */
  priorWeights?: number[];
  priorWeightVariance?: number;
  priorBias?: number;
  priorBiasVariance?: number;
  /** Optional physics constraint: a function (features, prediction) -> residual. The
   *  residual is added (squared) to the loss during training and to the runtime
   *  penalty. Example: for a motor, "input_voltage = rpm * kV + I * R" with the
   *  residual = (predicted_voltage - measured_voltage)^2. */
  physics?: { name: string; residual: (x: number[], yHat: number) => number; weight: number };
}

// --------------------------------------------------------------------------- fit / update

/**
 * Closed-form Bayesian update for a linear model with Gaussian prior and Gaussian
 * noise. The formula comes from the standard posterior of a linear-Gaussian model:
 *   posterior precision = prior precision + (1/sigma2) * Xᵀ X
 *   posterior mean      = posterior variance · (prior precision · prior mean
 *                                          + (1/sigma2) * Xᵀ y)
 *
 *   Returns a NEW model; the input is not mutated. This makes the function safe to
 *   call from a request handler and easy to test.
 */
export function fitLinear(rows: { x: number[]; y: number }[], spec: PbnnSpec, prev?: PbnnLinear): PbnnLinear {
  if (rows.length === 0) throw new Error("no rows to fit");
  const d = spec.features.length;
  if (!prev) {
    prev = {
      kind: "linear",
      weights: spec.priorWeights ?? new Array<number>(d).fill(0),
      bias: spec.priorBias ?? 0,
      prior: { mean: spec.priorWeights ?? new Array<number>(d).fill(0), variance: new Array<number>(d).fill(spec.priorWeightVariance ?? 1) },
      biasPrior: { mean: spec.priorBias ?? 0, variance: spec.priorBiasVariance ?? 1 },
      sigma2: 1,
      trainedOn: 0,
      updatedAt: Date.now(),
    };
  }
  if (prev.weights.length !== d) throw new Error(`feature count changed (was ${prev.weights.length}, now ${d})`);

  // Augment features with a constant 1 for the bias.
  const XtX: number[][] = Array.from({ length: d + 1 }, () => new Array<number>(d + 1).fill(0));
  const Xty: number[] = new Array<number>(d + 1).fill(0);

  // prior precision
  for (let i = 0; i < d; i++) XtX[i][i] += 1 / Math.max(prev.prior.variance[i], 1e-12);
  XtX[d][d] += 1 / Math.max(prev.biasPrior.variance, 1e-12);
  for (let i = 0; i < d; i++) Xty[i] += prev.prior.mean[i] / Math.max(prev.prior.variance[i], 1e-12);
  Xty[d] = prev.biasPrior.mean / Math.max(prev.biasPrior.variance, 1e-12);

  // data contribution
  let ss = 0; let n = 0;
  for (const r of rows) {
    if (r.x.length !== d) throw new Error(`row feature length ${r.x.length} != ${d}`);
    if (!Number.isFinite(r.y)) continue;
    const aug = [...r.x, 1];
    for (let i = 0; i < d + 1; i++) {
      for (let j = 0; j < d + 1; j++) XtX[i][j] += (aug[i] * aug[j]) / Math.max(prev.sigma2, 1e-12);
      Xty[i] += (aug[i] * r.y) / Math.max(prev.sigma2, 1e-12);
    }
    // physics loss contribution (if any) — folded in as a soft constraint on the
    // current prediction. We approximate by a quadratic term around the data y.
    if (spec.physics) {
      const yHat = r.x.reduce((s, v, i) => s + v * prev!.weights[i], prev.bias);
      const res = spec.physics.residual(r.x, yHat);
      const w = spec.physics.weight;
      for (let i = 0; i < d; i++) {
        for (let j = 0; j < d; j++) XtX[i][j] += w * r.x[i] * r.x[j];
        Xty[i] += w * r.x[i] * (r.y - res);
      }
      XtX[d][d] += w;
      Xty[d] += w * (r.y - res);
    }
    // running residual sum (for sigma^2 update)
    const yHat = r.x.reduce((s, v, i) => s + v * prev!.weights[i], prev.bias);
    ss += (r.y - yHat) ** 2;
    n++;
  }

  // Solve XtX · w = Xty with a tiny symmetric-positive Cholesky-ish solver.
  // d is small (≤ ~10 typically), so plain Gaussian elimination is fine and stable here.
  const w = solveSPD(XtX, Xty);

  // Update sigma^2 with the new residuals (keep a small floor so the next update is stable).
  const sigma2 = Math.max(1e-6, ss / Math.max(1, n - (d + 1)));

  return {
    kind: "linear",
    weights: w.slice(0, d),
    bias: w[d],
    prior: prev.prior,
    biasPrior: prev.biasPrior,
    sigma2,
    trainedOn: prev.trainedOn + n,
    updatedAt: Date.now(),
  };
}

/** Predict y_hat and a 1-sigma band. */
export function predict(m: PbnnLinear, x: number[]): { yHat: number; sigma: number } {
  if (x.length !== m.weights.length) throw new Error(`feature length ${x.length} != ${m.weights.length}`);
  const yHat = x.reduce((s, v, i) => s + v * m.weights[i], m.bias);
  // sigma from the noise prior — this is the residual std, not a true posterior std
  // (we would need the posterior covariance of w for that). The current form is the
  // honest minimum: it tells the caller what residual error to expect on average.
  return { yHat, sigma: Math.sqrt(m.sigma2) };
}

/** Evaluate a single prediction against a physics constraint. Returns the residual. */
export function physicsResidual(m: PbnnLinear, spec: PbnnSpec, x: number[]): { residual: number; name: string } | null {
  if (!spec.physics) return null;
  const { yHat } = predict(m, x);
  return { residual: spec.physics.residual(x, yHat), name: spec.physics.name };
}

// --------------------------------------------------------------------------- helper: solve a small SPD system
//
// LDLᵀ decomposition with no pivoting — fine for d ≤ ~30. Throws if the matrix is
// singular or not positive definite, which usually means the prior dominates the data
// (e.g. one feature, one row). The caller should expand the dataset.

function solveSPD(A: number[][], b: number[]): number[] {
  const n = A.length;
  // copy
  const M = A.map((r) => r.slice());
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) M[i][j] = A[i][j];
  const y = b.slice();
  // Cholesky
  const L: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let s = M[i][j];
      for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
      if (i === j) {
        if (s <= 0) throw new Error("matrix is not positive definite — need more data or a weaker prior");
        L[i][j] = Math.sqrt(s);
      } else L[i][j] = s / L[j][j];
    }
  }
  // forward
  for (let i = 0; i < n; i++) {
    let s = y[i];
    for (let k = 0; k < i; k++) s -= L[i][k] * y[k];
    y[i] = s / L[i][i];
  }
  // back
  for (let i = n - 1; i >= 0; i--) {
    let s = y[i];
    for (let k = i + 1; k < n; k++) s -= L[k][i] * y[k];
    y[i] = s / L[i][i];
  }
  return y;
}
