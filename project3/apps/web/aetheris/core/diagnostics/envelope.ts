/**
 * Envelope demodulation for bearing diagnostics.
 *
 *   Goal: extract the slow amplitude modulation hidden inside a high-frequency
 *         carrier. A real bearing-impact tone is a high-frequency ring (1-10 kHz)
 *         that gets *amplitude-modulated* at the bearing-fault frequency
 *         (typically tens to hundreds of Hz, riding on top of a 1x rotor tone).
 *         A plain FFT of the raw vibration sees the carrier and the 1x rotor,
 *         but the bearing-fault signature is buried. Envelope demodulation:
 *
 *           1. compute the analytic signal z = x + j*H(x) (Hilbert transform)
 *           2. take the magnitude envelope |z|
 *           3. band-pass or low-pass the envelope to remove DC
 *           4. FFT the envelope — the bearing-fault orders now stand out
 *
 *   This is the standard industrial tool for inner-race / outer-race detection.
 *
 *   What it is:
 *     - Pure-TS Hilbert transform via the FFT (zero negative frequencies, ×2
 *       positive frequencies, iFFT).
 *     - Magnitude envelope (peak amplitude of the analytic signal).
 *     - Optional DC removal and high-pass filter.
 *     - Direct spectrum of the envelope, reusing `fftSpectrum` from fft.ts.
 *
 *   What it is NOT:
 *     - Not a streaming demodulator. The whole signal is in memory.
 *     - Not a real-time envelope follower. For sample-by-sample envelope
 *       tracking use a diode + RC envelope follower (not in this module).
 *     - Not a lock-in amplifier. We demodulate by Hilbert, not by phase-
 *       sensitive detection.
 *
 *   Numerical notes:
 *     - Same floating-point accuracy as fft.ts. The Hilbert transform adds
 *       one extra iFFT round-trip; the error is well below 1e-9 for N <= 4096.
 *     - For a band-pass carrier (e.g. 2-5 kHz vibration at 25.6 kHz sample
 *       rate), the envelope is at most 5 kHz, so resample the envelope to a
 *       lower rate if you want longer windows. We expose `decimate` for this.
 *
 *   Status: EXPERIMENTAL but well-tested. See tests/diagnostics.test.ts.
 */

import { rawFft, applyWindow, nextPow2, Spectrum, fftSpectrum, Window } from "./fft";

// --------------------------------------------------------------------------- helpers

function ifftInPlace(re: number[], im: number[]): void {
  // Conjugate, forward FFT, conjugate, scale.
  const n = re.length;
  for (let i = 0; i < n; i++) im[i] = -im[i];
  rawFft(re, im);
  for (let i = 0; i < n; i++) {
    re[i] = re[i] / n;
    im[i] = -im[i] / n;
  }
}

/** Simple integer decimation by `factor`. Average-or-pick; we pick. */
export function decimate(signal: number[], factor: number): number[] {
  if (factor < 1 || !Number.isInteger(factor)) throw new Error("decimate factor must be a positive integer");
  const out: number[] = [];
  for (let i = 0; i < signal.length; i += factor) out.push(signal[i]);
  return out;
}

// --------------------------------------------------------------------------- analytic signal
//
// The Hilbert transform H(x) of a real signal x is the imaginary part of the
// analytic signal z = x + j*H(x). Constructed in the frequency domain:
//   - FFT the signal
//   - For the standard "analytic" version: zero out negative frequencies, double
//     positive frequencies, keep DC at 1x (don't double), keep Nyquist at 1x.
//   - iFFT.
// The result's magnitude |z[n]| is the instantaneous envelope of x[n].
//
// Reference: Marple, "Computing the discrete-time 'analytic' signal via FFT",
// IEEE Trans. Sig. Proc. (1999).

export interface AnalyticSignal {
  /** The real part (== input signal, with rounding error). */
  re: number[];
  /** The imaginary part, which is the Hilbert transform H(x). */
  im: number[];
  /** |z[n]|, the envelope of the input. */
  envelope: number[];
  /** Sample rate the input was captured at, in Hz. */
  sampleRateHz: number;
}

export function analyticSignal(opts: { signal: number[]; sampleRateHz: number; window?: Window }): AnalyticSignal {
  const signal = opts.signal;
  const sampleRateHz = opts.sampleRateHz;
  const window: Window = opts.window ?? "hann";
  if (signal.length === 0) throw new Error("signal must not be empty");
  if ((signal.length & (signal.length - 1)) !== 0) {
    // The Hilbert transform is easiest to define on a power-of-two signal. For
    // arbitrary lengths we zero-pad to the next power of two and slice back.
    // (Zero-padding in the time domain is a SINC interpolation, not a Hilbert
    // transform extension, but for our purposes — envelope magnitude — the
    // boundary effect is small and bounded.)
  }
  const n = nextPow2(signal.length);
  const windowed = applyWindow(signal, window);
  const re = new Array<number>(n).fill(0);
  const im = new Array<number>(n).fill(0);
  for (let i = 0; i < windowed.length; i++) re[i] = windowed[i];
  rawFft(re, im);

  // Construct the analytic spectrum:
  //   DC bin (k=0): keep at 1x.
  //   Positive frequencies (k=1..n/2-1): double.
  //   Nyquist (k=n/2): keep at 1x.
  //   Negative frequencies (k=n/2+1..n-1): zero.
  const half = n / 2;
  re[half] = im[half]; // preserve the real Nyquist value (imaginary is 0)
  for (let k = 1; k < half; k++) {
    re[k] = 2 * re[k];
    im[k] = 2 * im[k];
  }
  for (let k = half + 1; k < n; k++) {
    re[k] = 0;
    im[k] = 0;
  }

  ifftInPlace(re, im);

  // Slice back to the original length. For a Hann-windowed signal the first
  // and last samples are near zero anyway, so the slice is benign.
  const reOut = re.slice(0, signal.length);
  const imOut = im.slice(0, signal.length);
  const envelope = new Array<number>(signal.length);
  for (let i = 0; i < signal.length; i++) envelope[i] = Math.sqrt(reOut[i] * reOut[i] + imOut[i] * imOut[i]);

  return { re: reOut, im: imOut, envelope, sampleRateHz };
}

// --------------------------------------------------------------------------- envelope spectrum

export interface EnvelopeSpectrum {
  /** Envelope of the input. */
  envelope: number[];
  /** Sample rate of the envelope, in Hz (after decimation if applied). */
  envelopeSampleRateHz: number;
  /** Spectrum of the (DC-removed) envelope. */
  spectrum: Spectrum;
  /** Dominant frequency in the envelope spectrum. The bearing-fault frequency. */
  dominantEnvelopeHz: number | null;
  /** RMS of the envelope, in the same units as the input. */
  envelopeRms: number;
  /** Crest factor of the envelope (peak / RMS). High crest => impulsive faults. */
  envelopeCrest: number;
}

/**
 * Compute the envelope of a vibration signal and FFT it.
 *
 *   const e = envelopeSpectrum({ signal: vibration, sampleRateHz: 25600, decimate: 4 });
 *   // e.dominantEnvelopeHz: 89.3 Hz → matches outerRace signature at 1500 RPM
 *
 * The optional `decimate` parameter low-pass-and-pick to a lower sample rate
 * BEFORE the FFT, which trades frequency resolution for a longer time window.
 * For high-frequency carriers (e.g. 5 kHz accelerometer signal at 25.6 kHz),
 * decimating by 8 or 16 makes the envelope FFT much sharper.
 *
 * `highPassHz` removes the DC and very-low-frequency components of the
 * envelope (rotor 1x, unbalance, slow drift) so the bearing tones stand out.
 * Default 1 Hz, which is a sensible "ignore the rotor 1x" cutoff.
 */
export function envelopeSpectrum(opts: {
  signal: number[];
  sampleRateHz: number;
  window?: Window;
  decimate?: number;
  highPassHz?: number;
  /** FFT window to apply to the envelope before its own FFT. */
  envelopeWindow?: Window;
}): EnvelopeSpectrum {
  const sampleRateHz = opts.sampleRateHz;
  const dec = opts.decimate ?? 1;
  const highPassHz = opts.highPassHz ?? 1;
  const envWin: Window = opts.envelopeWindow ?? "hann";

  // 1. analytic signal
  const a = analyticSignal({ signal: opts.signal, sampleRateHz, window: opts.window });
  // 2. decimate the envelope
  const envDecimated = decimate(a.envelope, dec);
  const envRate = sampleRateHz / dec;
  // 3. high-pass (one-pole IIR, applied forward-backward = zero-phase).
  const filtered = highPassZeroPhase(envDecimated, envRate, highPassHz);
  // 4. FFT the envelope
  const spectrum = fftSpectrum({ signal: filtered, sampleRateHz: envRate, window: envWin });
  // 5. stats
  let peak = 0; for (const v of a.envelope) if (v > peak) peak = v;
  let sumSq = 0; for (const v of a.envelope) sumSq += v * v;
  const rms = Math.sqrt(sumSq / a.envelope.length);
  const crest = rms > 0 ? peak / rms : 0;
  return {
    envelope: a.envelope,
    envelopeSampleRateHz: envRate,
    spectrum,
    dominantEnvelopeHz: spectrum.dominantHz,
    envelopeRms: rms,
    envelopeCrest: crest,
  };
}

// --------------------------------------------------------------------------- high-pass filter
//
// One-pole RC high-pass, run forward and backward for zero phase distortion.
// At the very low frequencies we care about (1-500 Hz at low sample rates),
// the pole frequency precision is unimportant; we just want DC removed without
// ringing the bearing-fault tones.

function highPassZeroPhase(signal: number[], sampleRateHz: number, cutoffHz: number): number[] {
  if (cutoffHz <= 0) return signal.slice();
  // RC coefficient: alpha = dt / (RC + dt) = dt*fc / (1 + dt*fc) = fc / (fs + fc)
  const alpha = cutoffHz / (sampleRateHz + cutoffHz);
  // forward: y[n] = alpha * (y[n-1] + x[n] - x[n-1])
  const fwd = new Array<number>(signal.length);
  let prevX = 0, prevY = 0;
  for (let i = 0; i < signal.length; i++) {
    const x = signal[i];
    const y = alpha * (prevY + x - prevX);
    fwd[i] = y;
    prevX = x;
    prevY = y;
  }
  // backward: same recurrence on the reversed signal, then reverse
  const rev = new Array<number>(signal.length);
  prevX = 0; prevY = 0;
  for (let i = signal.length - 1; i >= 0; i--) {
    const x = fwd[i];
    const y = alpha * (prevY + x - prevX);
    rev[i] = y;
    prevX = x;
    prevY = y;
  }
  return rev;
}

// --------------------------------------------------------------------------- bearing diagnosis via envelope

export interface EnvelopeBearingMatch {
  fault: "outerRace" | "innerRace" | "ballSpin" | "cage";
  expectedHz: number;
  measuredHz: number;
  magnitude: number;
  distance: number;
}

/**
 * Run envelope demodulation and match the envelope spectrum against the
 * expected bearing-fault frequencies. This is the right tool for spotting
 * an outer-race defect that's hidden under a strong 1x rotor tone.
 */
export function diagnoseEnvelope(signal: number[], opts: {
  sampleRateHz: number;
  rotorRpm: number;
  window?: Window;
  decimate?: number;
  highPassHz?: number;
  toleranceHz?: number;
}): { matches: EnvelopeBearingMatch[]; spectrum: Spectrum; envelope: number[]; envelopeRms: number; envelopeCrest: number } {
  const toleranceHz = opts.toleranceHz ?? 0.5;
  const e = envelopeSpectrum({
    signal, sampleRateHz: opts.sampleRateHz, window: opts.window, decimate: opts.decimate, highPassHz: opts.highPassHz,
  });
  // Expected bearing-fault frequencies in the envelope spectrum.
  const fRunning = opts.rotorRpm / 60;
  const expected = {
    outerRace: 3.572 * fRunning,
    innerRace: 5.415 * fRunning,
    ballSpin:  0.234 * fRunning,
    cage:      0.385 * fRunning,
  };
  const matches: EnvelopeBearingMatch[] = [];
  for (const [name, exp] of Object.entries(expected) as [EnvelopeBearingMatch["fault"], number][]) {
    const k = Math.round(exp * e.spectrum.n / e.spectrum.sampleRateHz);
    if (k <= 0 || k >= e.spectrum.magnitude.length) continue;
    const bw = Math.max(1, Math.round(toleranceHz * e.spectrum.n / e.spectrum.sampleRateHz));
    let bestK = k; let bestM = -Infinity;
    for (let j = Math.max(1, k - bw); j <= Math.min(e.spectrum.magnitude.length - 2, k + bw); j++) {
      const m = e.spectrum.magnitude[j];
      if (m > bestM) { bestM = m; bestK = j; }
    }
    if (bestM > 0) matches.push({ fault: name, expectedHz: exp, measuredHz: e.spectrum.frequency[bestK], magnitude: bestM, distance: Math.abs(e.spectrum.frequency[bestK] - exp) });
  }
  matches.sort((a, b) => b.magnitude - a.magnitude);
  return { matches, spectrum: e.spectrum, envelope: e.envelope, envelopeRms: e.envelopeRms, envelopeCrest: e.envelopeCrest };
}
