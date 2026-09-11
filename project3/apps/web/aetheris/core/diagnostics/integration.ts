/**
 * Integration between the digital-twin wind-turbine simulator and the FFT
 * diagnostics engine.
 *
 *   Given a twin, run the simulator forward with the proposed anomaly level,
 *   sample the vibration channel, and run an FFT-based diagnostic. This is the
 *   "vibration went up; is the bearing faulty?" question the prompt's
 *   NIRIKSHAN-style diagnostic core would ask.
 *
 *   Status: EXPERIMENTAL.
 */

import { simulate, type Twin } from "../twins/twins";
import { canonicalTurbineTwin, type ChannelId } from "../windturbine/model";
import { diagnose, type DiagnosticResult } from "./engine";
import { bearingVibration } from "./fft";

export interface VibrationDiagnosticOptions {
  /** Rotor speed during the test, in RPM. Defaults to the twin's current rotor_rpm. */
  rotorRpm?: number;
  /** How long the simulator should run to produce a sample window. */
  durationSec?: number;
  /** Effective sample rate, in Hz. The simulator is a 60-second step model, so
   *  this is the "samples per second" the synthetic vibration is produced at.
   *  100 Hz is enough for bearing faults up to 50 Hz (Nyquist). */
  sampleRateHz?: number;
  /** Channel to sample. */
  channel?: ChannelId;
  /** Anomaly score to inject for the test (0..1). */
  anomalyScore?: number;
  /** Torque to drive the simulator with, in N·m. */
  torqueNm?: number;
  /** If true, mix a synthetic bearing-fault tone on top of the simulator's
   *  vibration so the test is detectable. Defaults to false. */
  injectBearingFault?: boolean;
  /** Optional uid for observability. */
  uid?: string;
}

/**
 * Drive the wind-turbine simulator, sample its vibration channel, and run a
 * diagnostic pass. Useful for the agent's "explain this anomaly" workflow.
 */
export function diagnoseTwin(twin: Twin, opts: VibrationDiagnosticOptions = {}): DiagnosticResult & { sample: number[]; sampleRateHz: number; rotorRpm: number; channel: ChannelId } {
  const channel: ChannelId = opts.channel ?? "vib_bearing_mms";
  const sampleRateHz = opts.sampleRateHz ?? 100;
  const durationSec = opts.durationSec ?? 10;
  const rotorRpm = opts.rotorRpm ?? Number(twin.state.rotor_rpm ?? 12);
  const anomalyScore = opts.anomalyScore ?? 0.5;
  const torqueNm = opts.torqueNm ?? 800_000;
  // 1. run the simulator for `durationSec` minutes (each step = 1 min by default)
  const steps = Math.max(1, Math.ceil(durationSec / 60));
  const sim = simulate(twin, { anomaly_score: anomalyScore, torque_Nm: torqueNm }, steps);
  const simVib = (sim.trajectory.map((s) => Number(s[channel] ?? 0)) as number[]);
  // 2. if the simulator produced too few samples for a meaningful FFT, pad
  // with the last value; if too many, take the last `durationSec*sampleRateHz`.
  const target = durationSec * sampleRateHz;
  let sample: number[];
  if (simVib.length === 0) sample = new Array(target).fill(0);
  else if (simVib.length >= target) sample = simVib.slice(-target);
  else {
    // up-sample by holding each value for the appropriate number of points
    const hold = Math.max(1, Math.floor(target / simVib.length));
    sample = [];
    for (const v of simVib) for (let k = 0; k < hold; k++) sample.push(v);
    while (sample.length < target) sample.push(simVib[simVib.length - 1]);
  }
  // 3. optionally mix a synthetic bearing-fault tone
  if (opts.injectBearingFault) {
    const synth = bearingVibration({ rotorRpm, sampleRateHz, durationSec, noiseAmp: 0.05, faultAmp: 2.0, seed: 42 });
    for (let i = 0; i < sample.length; i++) sample[i] = sample[i] + synth[i] * 0.1;
  }
  // 4. run the diagnostic
  const r = diagnose(sample, { sampleRateHz, rotorRpm, uid: opts.uid });
  return { ...r, sample, sampleRateHz, rotorRpm, channel };
}

/**
 * Build a synthetic WTG twin + vibration trace end-to-end. Convenience for
 * tests and demos. Mirrors `diagnoseTwin` but starts from a canonical twin.
 */
export function diagnoseCanonical(opts: VibrationDiagnosticOptions = {}): DiagnosticResult & { sample: number[]; sampleRateHz: number; rotorRpm: number; channel: ChannelId } {
  const draft = canonicalTurbineTwin({ id: "diag", name: "diag" });
  const twin = { ...draft, id: "diag", uid: "u", createdAt: 0, updatedAt: 0, history: [], events: [], maintenance: [] } as Twin;
  return diagnoseTwin(twin, opts);
}
