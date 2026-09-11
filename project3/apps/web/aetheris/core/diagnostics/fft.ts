/**
 * FFT — pure TypeScript, zero dependencies, deterministic.
 *
 *   Goal: give the agent and the UI a real frequency-domain view of a telemetry
 *         signal. No approximations, no shortcuts. If the user pastes a 1024-point
 *         vibration trace in, they get a 512-bin magnitude spectrum out, with
 *         the correct frequency axis, DC bin included, and amplitude in the same
 *         units as the input.
 *
 *   What it is:
 *     - Cooley-Tukey radix-2 in-place FFT, iterative (no recursion limit).
 *     - Iterative bit-reversal permutation before the butterfly.
 *     - Windowing: Hann, Hamming, Blackman, Rectangular. Default is Hann for
 *       general-purpose spectral analysis; rectangular when the caller is
 *       explicitly using a known periodic signal.
 *     - Magnitude spectrum, power spectrum, and phase spectrum, all real-input.
 *     - Frequency axis: `bin * sampleRateHz / N` for `bin` in `[0, N/2]`.
 *
 *   What it is NOT:
 *     - Not a streaming FFT. Whole signal in memory; signal length capped at
 *       65536 points (configurable). For longer streams, window + slide.
 *     - Not an overlap-save / overlap-add filter. Just one-shot spectra.
 *     - Not a 2D / image FFT. 1D only.
 *     - Not a windowed-sinc FIR, not an IIR, not a Goertzel. Just the FFT.
 *
 *   Numerical notes:
 *     - Pure floating-point. The error is well below 1e-10 for N <= 4096 and
 *       well below 1e-6 for N <= 32768. The tests assert that bound.
 *     - Real and imaginary parts are computed in double precision. There is no
 *       single-precision path.
 *
 *   Status: EXPERIMENTAL but well-tested. See tests/diagnostics.test.ts.
 */

// --------------------------------------------------------------------------- types
export interface Complex { re: number; im: number }
export type Window = "rect" | "hann" | "hamming" | "blackman";

export interface Spectrum {
  /** Number of input samples (after zero-padding to a power of two). */
  n: number;
  /** Sample rate the input was captured at, in Hz. */
  sampleRateHz: number;
  /** Window function that was applied (before FFT). */
  window: Window;
  /** Frequency of each bin, in Hz. Length = n/2. */
  frequency: number[];
  /** Magnitude spectrum (|X[k]|). Length = n/2. DC at index 0. */
  magnitude: number[];
  /** Power spectrum (|X[k]|^2). Length = n/2. */
  power: number[];
  /** Phase spectrum (atan2(im, re)) in radians. Length = n/2. */
  phase: number[];
  /** The dominant frequency, in Hz. `null` if the spectrum is all zero. */
  dominantHz: number | null;
  /** The RMS of the input signal (in the same units as the input). */
  rms: number;
  /** Total energy of the windowed signal. */
  energy: number;
}

// --------------------------------------------------------------------------- windows
//
// We expose four standard windows. For a bin-centered complex exponential
// `exp(j 2π k n / N)`, the FFT at bin k equals `N * mean(window)` = `N * cg`,
// where `cg` is the window's coherent gain. To recover the input amplitude
// from the FFT output, we divide by `n * cg`. We compute the *exact* coherent
// gain for the given N at runtime (rather than using the asymptotic limit),
// because for short N (N=128) the Hann coherent gain is 0.496, not 0.5, and
// using 0.5 would cause a 0.4% amplitude error. (Dividing by the window peak
// instead of cg under-corrects for Hann / Hamming / Blackman by 2x or more,
// and is a classic FFT amplitude bug.)

const TABLE: Record<Window, (n: number, i: number) => number> = {
  rect:    () => 1,
  hann:    (n, i) => 0.5 * (1 - Math.cos(2 * Math.PI * i / (n - 1))),
  hamming: (n, i) => 0.54 - 0.46 * Math.cos(2 * Math.PI * i / (n - 1)),
  blackman: (n, i) => 0.42 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1)) + 0.08 * Math.cos(4 * Math.PI * i / (n - 1)),
};

/** Exact coherent gain of the chosen window for an FFT of length `n`. */
function windowCG(window: Window, n: number): number {
  const w = TABLE[window];
  let sum = 0;
  for (let i = 0; i < n; i++) sum += w(n, i);
  return sum / n;
}

export function applyWindow(input: number[], window: Window): number[] {
  const n = input.length;
  const w = TABLE[window];
  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) out[i] = input[i] * w(n, i);
  return out;
}

// --------------------------------------------------------------------------- FFT
//
// In-place iterative radix-2. Throws if the input length is not a power of two.
// (For arbitrary lengths, callers should zero-pad to the next power of two
// BEFORE calling; the public `fftMagnitude` helper does that automatically.)
//
// Exported as `rawFft` so the Hilbert transform in `envelope.ts` can reuse the
// same radix-2 engine and stay consistent with the rest of the module.

export function rawFft(re: number[], im: number[]): void {
  const n = re.length;
  if (n === 0) return;
  if ((n & (n - 1)) !== 0) throw new Error(`FFT length must be a power of two, got ${n}`);
  // Bit-reversal permutation
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  // Butterfly
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len;
    const wRe = Math.cos(ang), wIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cRe = 1, cIm = 0;
      const half = len >> 1;
      for (let k = 0; k < half; k++) {
        const uRe = re[i + k], uIm = im[i + k];
        const vRe = cRe * re[i + k + half] - cIm * im[i + k + half];
        const vIm = cRe * im[i + k + half] + cIm * re[i + k + half];
        re[i + k] = uRe + vRe; im[i + k] = uIm + vIm;
        re[i + k + half] = uRe - vRe; im[i + k + half] = uIm - vIm;
        const newCRe = cRe * wRe - cIm * wIm;
        const newCIm = cRe * wIm + cIm * wRe;
        cRe = newCRe; cIm = newCIm;
      }
    }
  }
}

/** Smallest power of two >= n. Exported for envelope.ts (Hilbert transform). */
export function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

// --------------------------------------------------------------------------- public API

/**
 * Compute the magnitude / power / phase spectrum of a real signal.
 *
 *   const s = fftSpectrum({ signal: vibration, sampleRateHz: 100 });
 *   console.log(s.dominantHz, s.magnitude);
 *
 *   - `signal` is the raw samples; the function zero-pads to the next power of
 *     two and applies `window` before the FFT.
 *   - `window` defaults to Hann, which is appropriate for most diagnostic work.
 *     Use `rect` only when the signal is exactly periodic and integer-periodic
 *     in the window.
 *   - The returned `magnitude` is the one-sided spectrum in the "peak
 *     amplitude" convention: a bin-centered 1-amp tone reads as 1.0,
 *     a 15 mm/s vibration reads as 15. We achieve this by (a) doubling the
 *     non-DC/non-Nyquist bins and (b) dividing by the window's coherent
 *     gain. DC and Nyquist are returned un-scaled.
 */
export function fftSpectrum(opts: { signal: number[]; sampleRateHz: number; window?: Window }): Spectrum {
  const { signal } = opts;
  const sampleRateHz = opts.sampleRateHz;
  const window: Window = opts.window ?? "hann";
  if (sampleRateHz <= 0 || !Number.isFinite(sampleRateHz)) throw new Error("sampleRateHz must be positive");
  if (signal.length === 0) throw new Error("signal must not be empty");
  if (signal.length > 65536) throw new Error("signal too long (max 65536 points); window and slide for longer streams");

  // 1. window
  const windowed = applyWindow(signal, window);
  // 2. zero-pad to a power of two
  const n = nextPow2(signal.length);
  const re = new Array<number>(n).fill(0);
  const im = new Array<number>(n).fill(0);
  for (let i = 0; i < windowed.length; i++) re[i] = windowed[i];
  rawFft(re, im);

  // 3. one-sided spectrum, in the "peak amplitude" convention: a 15 mm/s
  // bin-centered tone returns 15.0 at its bin. The factor of 2 on non-edge
  // bins folds the +f and -f energy into a single amplitude, matching what
  // vibration sensors and ISO 10816 thresholds report.
  const half = n / 2;
  const magnitude = new Array<number>(half);
  const power = new Array<number>(half);
  const phase = new Array<number>(half);
  const frequency = new Array<number>(half);
  const cg = windowCG(window, n);
  for (let k = 0; k < half; k++) {
    const m = (k === 0 || k === half - 1 ? 1 : 2) * Math.sqrt(re[k] * re[k] + im[k] * im[k]) / (n * cg);
    magnitude[k] = m;
    power[k] = m * m;
    phase[k] = Math.atan2(im[k], re[k]);
    frequency[k] = (k * sampleRateHz) / n;
  }

  // 4. derived statistics
  let rms = 0; for (const v of signal) rms += v * v; rms = Math.sqrt(rms / signal.length);
  let energy = 0; for (const v of windowed) energy += v * v;
  // dominant frequency: ignore DC (k=0); find the peak.
  let dominantK = 0; let dominantMag = -Infinity;
  for (let k = 1; k < half; k++) { if (magnitude[k] > dominantMag) { dominantMag = magnitude[k]; dominantK = k; } }
  const dominantHz = dominantMag > 0 ? frequency[dominantK] : null;

  return { n, sampleRateHz, window, frequency, magnitude, power, phase, dominantHz, rms, energy };
}

/**
 * Convenience: take an FFT and return the top-N peaks (frequency + magnitude).
 * Sorted by magnitude descending. Useful for the diagnostic UI.
 */
export function spectralPeaks(spectrum: Spectrum, n: number, opts: { minHz?: number; maxHz?: number } = {}): { frequency: number; magnitude: number }[] {
  const minHz = opts.minHz ?? 0;
  const maxHz = opts.maxHz ?? Infinity;
  const peaks: { frequency: number; magnitude: number; k: number }[] = [];
  for (let k = 1; k < spectrum.magnitude.length - 1; k++) {
    const m = spectrum.magnitude[k];
    const f = spectrum.frequency[k];
    if (f < minHz || f > maxHz) continue;
    // local maximum: bigger than both neighbours
    if (m > spectrum.magnitude[k - 1] && m > spectrum.magnitude[k + 1]) peaks.push({ frequency: f, magnitude: m, k });
  }
  peaks.sort((a, b) => b.magnitude - a.magnitude);
  return peaks.slice(0, n).map(({ frequency, magnitude }) => ({ frequency, magnitude }));
}

// --------------------------------------------------------------------------- bearing-fault signatures
//
// A pragmatic reference table for wind-turbine drivetrain vibration. The exact
// numbers depend on the geometry, but the *order* of each fault relative to the
// rotor or generator speed is what the diagnostic cares about.

/** Common bearing-fault frequencies in *orders* of the running speed. */
export const BEARING_FAULT_ORDERS = {
  /** Outer-race defect frequency, in multiples of running speed. */
  outerRace: 3.572,
  /** Inner-race defect frequency. */
  innerRace: 5.415,
  /** Ball-spin frequency. */
  ballSpin: 0.234,
  /** Cage (train) frequency. */
  cage: 0.385,
} as const;

/** Return the expected bearing-fault frequencies (Hz) for a given rotor RPM. */
export function bearingFaultFrequencies(rotorRpm: number) {
  const fRunning = rotorRpm / 60;
  return {
    outerRace: BEARING_FAULT_ORDERS.outerRace * fRunning,
    innerRace: BEARING_FAULT_ORDERS.innerRace * fRunning,
    ballSpin:  BEARING_FAULT_ORDERS.ballSpin  * fRunning,
    cage:      BEARING_FAULT_ORDERS.cage      * fRunning,
  };
}

/**
 * Compare a measured spectrum against the expected bearing-fault frequencies.
 * Returns a list of "matches" — peaks within `toleranceHz` of an expected fault
 * frequency, sorted by how confident the match is (closer + higher magnitude).
 *
 *   The diagnostic panel uses this to label a spike as "matches outer-race
 *   signature at 6.3 Hz" rather than "anomaly at 6.3 Hz".
 */
export function matchBearingSignatures(spectrum: Spectrum, rotorRpm: number, toleranceHz = 0.5): { fault: keyof typeof BEARING_FAULT_ORDERS; expectedHz: number; measuredHz: number; magnitude: number; distance: number }[] {
  const expected = bearingFaultFrequencies(rotorRpm);
  const matches: { fault: keyof typeof BEARING_FAULT_ORDERS; expectedHz: number; measuredHz: number; magnitude: number; distance: number }[] = [];
  for (const [name, exp] of Object.entries(expected) as [keyof typeof BEARING_FAULT_ORDERS, number][]) {
    // find the bin nearest the expected frequency
    const k = Math.round(exp * spectrum.n / spectrum.sampleRateHz);
    if (k <= 0 || k >= spectrum.magnitude.length) continue;
    // local peak search within ±toleranceHz
    const bw = Math.max(1, Math.round(toleranceHz * spectrum.n / spectrum.sampleRateHz));
    let bestK = k; let bestM = -Infinity;
    for (let j = Math.max(1, k - bw); j <= Math.min(spectrum.magnitude.length - 2, k + bw); j++) {
      const m = spectrum.magnitude[j];
      if (m > bestM) { bestM = m; bestK = j; }
    }
    if (bestM > 0) matches.push({ fault: name, expectedHz: exp, measuredHz: spectrum.frequency[bestK], magnitude: bestM, distance: Math.abs(spectrum.frequency[bestK] - exp) });
  }
  matches.sort((a, b) => b.magnitude - a.magnitude);
  return matches;
}

// --------------------------------------------------------------------------- synthetic test signal
//
// Exposed for tests and demo. `bearingVibration()` produces a sum of:
//   - rotor-frequency tone (1x running)
//   - bearing-fault tones at the four canonical orders
//   - white noise
// so the diagnostic pipeline can be verified end-to-end without hardware.

export function bearingVibration(opts: { rotorRpm: number; sampleRateHz: number; durationSec: number; noiseAmp?: number; faultAmp?: number; rotorAmp?: number; seed?: number }): number[] {
  const { rotorRpm, sampleRateHz, durationSec } = opts;
  const noiseAmp = opts.noiseAmp ?? 0.05;
  const faultAmp = opts.faultAmp ?? 1.0;
  const rotorAmp = opts.rotorAmp ?? 0.5;
  const fRun = rotorRpm / 60;
  const expected = bearingFaultFrequencies(rotorRpm);
  const n = Math.round(durationSec * sampleRateHz);
  const out = new Array<number>(n);
  // simple LCG noise so tests are deterministic with a given seed
  let s = opts.seed ?? 1;
  const rand = () => { s = (s * 1664525 + 1013904223) >>> 0; return (s / 0xFFFFFFFF) * 2 - 1; };
  for (let i = 0; i < n; i++) {
    const t = i / sampleRateHz;
    let v = 0;
    v += rotorAmp * Math.sin(2 * Math.PI * fRun * t);
    v += faultAmp * Math.sin(2 * Math.PI * expected.outerRace * t);
    v += faultAmp * 0.6 * Math.sin(2 * Math.PI * expected.innerRace * t);
    v += faultAmp * 0.3 * Math.sin(2 * Math.PI * expected.ballSpin * t);
    v += noiseAmp * rand();
    out[i] = v;
  }
  return out;
}
