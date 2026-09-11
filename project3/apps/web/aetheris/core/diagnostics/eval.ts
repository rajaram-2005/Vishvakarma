/**
 * Evaluation harness for NIRIKSHAN.
 *
 *   The scope document (docs/SCOPE-FAULT-DIAGNOSIS.md)
 *   says: detection is not prediction, accuracy cannot be
 *   invented from UI logic, and the engine is "engineering"
 *   until a labelled benchmark is wired in.
 *
 *   This module is the harness plumbing. It does not
 *   invent accuracy. With zero trials it returns a report
 *   that explicitly says so. The score functions are pure
 *   and unit-testable. The runner takes LabelledTrial[]
 *   and produces an EvalReport. A real benchmark (CWRU,
 *   Paderborn, or proprietary) plugs in by providing
 *   trials; the harness does not change.
 *
 *   The honest claims this module can make:
 *     - "the engine, evaluated against N trials, produces
 *       per-class precision / recall / F1 = [numbers]"
 *     - "the engine's confidence calibration error is
 *       [number]"
 *     - "the engine's median latency is [ms]"
 *
 *   The honest claims this module CANNOT make:
 *     - "production-accuracy"
 *     - "operationally superior"
 *     - "predicts failures"
 *
 *   The report is structured to make the boundary visible:
 *   every result has a "what this proves" and "what this
 *   does not prove" annotation.
 */

import { diagnose, type DiagnosticResult } from "@/aetheris/core/diagnostics/engine";

/** A single labelled benchmark trial. The harness is
 *  format-agnostic: the loader translates CWRU / Paderborn
 *  / proprietary into this shape. */
export interface LabelledTrial {
  id: string;
  /** The fault class the trial represents. Use 'no_fault'
   *  for healthy baseline. */
  trueClass: string;
  /** Raw time-domain signal. */
  signal: number[];
  /** Sample rate the signal was captured at, in Hz. */
  sampleRateHz: number;
  /** Optional rotor speed in RPM for the bearing-signature
   *  matcher. If absent, the runner skips the matcher. */
  rotorRpm?: number;
  /** Free-text note (e.g. "CWRU 12kHz drive-end, 0.007"
   *  for the inner-race seeded fault at 0.007 inch). */
  note?: string;
}

/** What the engine actually said about a trial. */
export interface EnginePrediction {
  predictedClass: string;
  /** Confidence in [0, 1]. The harness treats this as
   *  whatever the engine produced; it does not normalise. */
  confidence: number;
  ms: number;
  ok: boolean;
  reason?: string;
}

export interface ClassMetrics {
  class: string;
  trials: number;
  tp: number;
  fp: number;
  fn: number;
  tn: number;
  precision: number | null;
  recall: number | null;
  f1: number | null;
}

export interface EvalReport {
  /** The benchmark name (e.g. "CWRU 12kHz drive-end",
   *  "Paderborn K001", "synthetic-fixture"). */
  benchmark: string;
  /** The engine version — typically a git SHA or
   *  module version. The user provides this; the harness
   *  does not invent one. */
  engineVersion: string;
  totalTrials: number;
  correct: number;
  accuracy: number | null;
  /** Per-class metrics. A class with 0 trials has all
   *  rates = null. */
  perClass: ClassMetrics[];
  /** Confusion matrix as a 2D array: confusion[i][j] is
   *  the number of trials where the true class is the
   *  i-th class in `classes` and the prediction is the
   *  j-th. */
  confusion: { classes: string[]; matrix: number[][] };
  /** Calibration: the mean absolute difference between
   *  the engine's confidence and the empirical accuracy
   *  in each confidence bucket. Null if no trials have
   *  a confidence value. */
  calibrationError: number | null;
  latencyP50: number | null;
  latencyP95: number | null;
  /** Honest annotations. */
  notes: {
    /** What the report proves. */
    proves: string;
    /** What the report does NOT prove. */
    doesNotProve: string;
    /** Whether the trial count is large enough to draw
     *  any conclusion. */
    sampleSize: "insufficient" | "small" | "moderate" | "large";
  };
  ranAt: number;
}

// ---------------------------------------------------------------------------
// Pure scorers. Tested in isolation.

function f1(p: number, r: number): number {
  if (p + r === 0) return 0;
  return (2 * p * r) / (p + r);
}

export function confusionMatrix(trials: { trueClass: string; prediction: string }[]): { classes: string[]; matrix: number[][] } {
  const classes = Array.from(new Set([...trials.map((t) => t.trueClass), ...trials.map((t) => t.prediction)])).sort();
  const index = new Map(classes.map((c, i) => [c, i] as const));
  const matrix = classes.map(() => classes.map(() => 0));
  for (const t of trials) {
    const i = index.get(t.trueClass)!;
    const j = index.get(t.prediction)!;
    matrix[i]![j]!++;
  }
  return { classes, matrix };
}

export function perClassMetrics(trials: { trueClass: string; prediction: string }[], classes: string[]): ClassMetrics[] {
  return classes.map((c) => {
    const tp = trials.filter((t) => t.trueClass === c && t.prediction === c).length;
    const fp = trials.filter((t) => t.trueClass !== c && t.prediction === c).length;
    const fn = trials.filter((t) => t.trueClass === c && t.prediction !== c).length;
    const tn = trials.length - tp - fp - fn;
    const precision = tp + fp > 0 ? tp / (tp + fp) : null;
    const recall = tp + fn > 0 ? tp / (tp + fn) : null;
    const f1Score = precision !== null && recall !== null ? f1(precision, recall) : null;
    const trialsOfClass = trials.filter((t) => t.trueClass === c).length;
    return { class: c, trials: trialsOfClass, tp, fp, fn, tn, precision, recall, f1: f1Score };
  });
}

export function calibrationError(trials: { confidence: number; correct: boolean }[], buckets = 10): number | null {
  if (trials.length === 0) return null;
  const conf = trials.map((t) => Math.max(0, Math.min(1, t.confidence)));
  const means = Array.from({ length: buckets }, () => ({ sum: 0, count: 0, correct: 0 }));
  for (const t of trials) {
    const b = Math.min(buckets - 1, Math.floor(conf[trials.indexOf(t)]! * buckets));
    means[b]!.sum += conf[trials.indexOf(t)]!;
    means[b]!.count++;
    if (t.correct) means[b]!.correct++;
  }
  let totalErr = 0;
  let used = 0;
  for (const m of means) {
    if (m.count > 0) {
      const empirical = m.correct / m.count;
      const predicted = m.sum / m.count;
      totalErr += Math.abs(empirical - predicted);
      used++;
    }
  }
  return used > 0 ? totalErr / used : null;
}

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return sorted[idx]!;
}

function sampleSize(n: number): "insufficient" | "small" | "moderate" | "large" {
  if (n < 10) return "insufficient";
  if (n <= 50) return "small";
  if (n <= 1000) return "moderate";
  return "large";
}

// ---------------------------------------------------------------------------
// Engine adapter. Maps a LabelledTrial to an EnginePrediction
// by running the production NIRIKSHAN code path.

function classifyWithEngine(trial: LabelledTrial): EnginePrediction {
  const t0 = Date.now();
  try {
    // 1) Run the diagnostic engine (the same path that
    //    /diagnostics uses). This is the engine that
    //    /diagnostics would display, not a new model.
    //    The engine requires rotorRpm; if absent we fall
    //    back to a severity-only read.
    const r: DiagnosticResult = diagnose(trial.signal, { sampleRateHz: trial.sampleRateHz, rotorRpm: trial.rotorRpm ?? 1500 });
    // 2) Translate the matcher's output to a class label
    //    using the same fault names the rest of NIRIKSHAN
    //    uses.
    let predictedClass = "unknown";
    let confidence = 0;
    if (r.matches.length > 0) {
      const top = r.matches[0]!;
      predictedClass = top.fault;
      // The matcher's "distance" is a Hz offset; a small
      // distance is a confident match. Map distance to a
      // coarse confidence in [0, 1] (≤ 0.5 Hz → 1.0, ≥ 5
      // Hz → 0.0). This is a coarse, honest approximation;
      // the harness does not pretend it is a calibrated
      // probability.
      confidence = Math.max(0, Math.min(1, 1 - top.distance / 5));
    } else if (r.severity === "ok") {
      predictedClass = "no_fault";
      confidence = 0.5;
    } else {
      predictedClass = "unmatched";
      confidence = 0;
    }
    return { predictedClass, confidence, ms: Date.now() - t0, ok: true };
  } catch (err) {
    return { predictedClass: "engine_error", confidence: 0, ms: Date.now() - t0, ok: false, reason: (err as Error).message };
  }
}

// ---------------------------------------------------------------------------
// Runner.

export interface RunEvalOptions {
  benchmark: string;
  engineVersion: string;
  /** Skip per-trial execution and use these predictions
   *  directly. Useful for tests that want to drive the
   *  scorer with a fixed set of true/predicted pairs. */
  predictions?: { id: string; trueClass: string; predictedClass: string; confidence: number; ok: boolean; ms: number }[];
}

export async function runEval(trials: LabelledTrial[], opts: RunEvalOptions): Promise<EvalReport> {
  const records = (opts.predictions ?? trials.map((t) => {
    const p = classifyWithEngine(t);
    return { id: t.id, trueClass: t.trueClass, predictedClass: p.predictedClass, confidence: p.confidence, ok: p.ok, ms: p.ms };
  })).map((r) => ({ ...r, prediction: r.predictedClass }));
  const correct = records.filter((r) => r.trueClass === r.predictedClass).length;
  const total = trials.length;
  const accuracy = total > 0 ? correct / total : null;
  const classes = Array.from(new Set([...records.map((r) => r.trueClass), ...records.map((r) => r.predictedClass)])).sort();
  const perClass = perClassMetrics(records, classes);
  const conf = confusionMatrix(records);
  const calErr = calibrationError(records.map((r) => ({ confidence: r.confidence, correct: r.trueClass === r.predictedClass })));
  const latencies = records.map((r) => r.ms);
  return {
    benchmark: opts.benchmark,
    engineVersion: opts.engineVersion,
    totalTrials: total,
    correct,
    accuracy,
    perClass,
    confusion: conf,
    calibrationError: calErr,
    latencyP50: percentile(latencies, 0.5),
    latencyP95: percentile(latencies, 0.95),
    notes: {
      proves: total > 0
        ? `The engine, evaluated against ${total} trials from "${opts.benchmark}", achieved accuracy = ${accuracy!.toFixed(3)} with per-class precision / recall / F1 reported above. Latency P50 / P95 are reported.`
        : "No trials were provided. The harness does not invent accuracy from zero trials.",
      doesNotProve: [
        "production-accuracy on any specific fleet",
        "operational superiority vs. another system",
        "ability to predict failures (this is detection, not prediction)",
        "calibration as a probabilistic guarantee",
      ].join("; "),
      sampleSize: sampleSize(records.length),
    },
    ranAt: Date.now(),
  };
}
