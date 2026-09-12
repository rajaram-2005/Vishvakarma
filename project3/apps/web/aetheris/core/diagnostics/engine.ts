/**
 * Diagnostic engine — wraps the FFT with interpretation for the wind-turbine
 * domain. Given a vibration signal and a rotor speed, it produces a structured
 * "diagnosis" the agent can act on: dominant frequency, spectral peaks,
 * bearing-fault signature matches, and a coarse severity estimate.
 *
 *   This is a *signal-processing* module, not a model-based diagnostics
 *   system. It tells the agent "there is a strong peak at 6.3 Hz that matches
 *   the outer-race signature" — it does not (and cannot) say "the bearing is
 *   about to fail". That is a maintenance decision; the engine just provides
 *   the evidence.
 *
 *   Status: EXPERIMENTAL. Tested in tests/diagnostics.test.ts.
 */

import { record } from "../observability/events";
import { fftSpectrum, matchBearingSignatures, spectralPeaks, type Spectrum, type Window } from "./fft";
import { diagnoseEnvelope, type EnvelopeBearingMatch } from "./envelope";

export type Severity = "ok" | "watch" | "warning" | "critical";

export interface EnvelopeResult {
  /** Envelope of the input signal. */
  envelope: number[];
  /** Sample rate of the envelope, in Hz (after decimation). */
  envelopeSampleRateHz: number;
  /** Spectrum of the (DC-removed, high-passed) envelope. */
  spectrum: Spectrum;
  /** Bearing-fault matches in the envelope spectrum. */
  matches: EnvelopeBearingMatch[];
  /** RMS of the envelope (peak amplitude of the vibration). */
  envelopeRms: number;
  /** Crest factor of the envelope (peak / RMS). High ⇒ impulsive faults. */
  envelopeCrest: number;
  /** Dominant envelope frequency, in Hz. `null` if silent. */
  dominantEnvelopeHz: number | null;
}

export interface DiagnosticResult {
  ok: true;
  spectrum: Spectrum;
  peaks: { frequency: number; magnitude: number }[];
  /** Bearing-fault signature matches: expected vs measured. */
  matches: { fault: string; expectedHz: number; measuredHz: number; magnitude: number; distance: number }[];
  /** Dominant frequency, in Hz. `null` if the signal is silent. */
  dominantHz: number | null;
  /** Overall severity classification based on the peak magnitudes. */
  severity: Severity;
  /** A short human-readable summary. */
  summary: string;
  /** Evidence list, ready for the "evidence drawer" UI. */
  evidence: string[];
  /** Optional envelope-demodulation result. Present iff `opts.envelope === true`. */
  envelope?: EnvelopeResult;
}

export interface DiagnosticOptions {
  /** Sample rate of the input signal, in Hz. */
  sampleRateHz: number;
  /** Current rotor speed, in RPM. */
  rotorRpm: number;
  /** Window function. Defaults to Hann. */
  window?: Window;
  /** Match tolerance for bearing signatures, in Hz. Default 0.5. */
  toleranceHz?: number;
  /** How many peaks to return. Default 5. */
  topPeaks?: number;
  /** Thresholds for severity (mm/s equivalent). Defaults are conservative. */
  thresholds?: { watch: number; warning: number; critical: number };
  /** Optional uid for observability. */
  uid?: string;
  /** Run envelope demodulation and include the result. Useful for bearing
   *  faults hidden under strong 1x rotor tones. Default false. */
  envelope?: boolean;
  /** Decimation factor for the envelope (see envelope.ts). Default 1. */
  envelopeDecimate?: number;
  /** High-pass cutoff (Hz) applied to the envelope before its FFT. Default 1 Hz. */
  envelopeHighPassHz?: number;
  /** Envelope-match tolerance in Hz. Default 0.5. */
  envelopeToleranceHz?: number;
}

const DEFAULT_THRESHOLDS = { watch: 4.5, warning: 7.1, critical: 11.2 } as const;

/**
 * Run a diagnostic pass on a vibration signal.
 *
 *   const r = diagnose({ signal: vibrationTrace, sampleRateHz: 1000, rotorRpm: 1500 });
 *   console.log(r.severity, r.summary, r.evidence);
 */
export function diagnose(signal: number[], opts: DiagnosticOptions): DiagnosticResult {
  const t0 = Date.now();
  const spectrum = fftSpectrum({ signal, sampleRateHz: opts.sampleRateHz, window: opts.window });
  const peaks = spectralPeaks(spectrum, opts.topPeaks ?? 5);
  const matches = matchBearingSignatures(spectrum, opts.rotorRpm, opts.toleranceHz ?? 0.5);
  const thresholds = opts.thresholds ?? DEFAULT_THRESHOLDS;
  const maxMag = peaks.length ? peaks[0].magnitude : 0;
  const severity: Severity = maxMag >= thresholds.critical ? "critical" : maxMag >= thresholds.warning ? "warning" : maxMag >= thresholds.watch ? "watch" : "ok";

  const evidence: string[] = [];
  evidence.push(`Sample rate ${opts.sampleRateHz} Hz, N=${spectrum.n} points (zero-padded from ${signal.length}), window=${spectrum.window}.`);
  evidence.push(`Dominant frequency: ${spectrum.dominantHz !== null ? spectrum.dominantHz.toFixed(3) + " Hz" : "none (silent signal)"}.`);
  if (peaks.length) evidence.push(`Top peaks: ${peaks.map((p) => `${p.frequency.toFixed(2)} Hz @ ${p.magnitude.toFixed(3)}`).join(", ")}.`);
  if (matches.length) evidence.push(`Bearing-signature matches: ${matches.map((m) => `${m.fault} expected ${m.expectedHz.toFixed(2)} Hz, measured ${m.measuredHz.toFixed(2)} Hz, Δ=${m.distance.toFixed(3)} Hz`).join("; ")}.`);
  evidence.push(`Severity: ${severity} (peak ${maxMag.toFixed(3)} vs thresholds ${thresholds.watch}/${thresholds.warning}/${thresholds.critical}).`);

  const summary = (() => {
    if (matches.length === 0) return `No bearing-fault signature match. Dominant tone at ${spectrum.dominantHz?.toFixed(2) ?? "?"} Hz. Severity: ${severity}.`;
    const top = matches[0];
    return `Bearing signature: ${top.fault} at ${top.measuredHz.toFixed(2)} Hz (expected ${top.expectedHz.toFixed(2)} Hz, Δ ${top.distance.toFixed(3)} Hz). Severity: ${severity}.`;
  })();

  record({ type: "agent", uid: opts.uid, capability: "system:diagnostics", ok: true, ms: Date.now() - t0, detail: `diagnostic ${severity} (peak ${maxMag.toFixed(3)})`, meta: { peaks: peaks.length, matches: matches.length, dominantHz: spectrum.dominantHz } });
  const result: DiagnosticResult = { ok: true, spectrum, peaks, matches, dominantHz: spectrum.dominantHz, severity, summary, evidence };

  if (opts.envelope) {
    const e = diagnoseEnvelope(signal, {
      sampleRateHz: opts.sampleRateHz,
      rotorRpm: opts.rotorRpm,
      window: opts.window,
      decimate: opts.envelopeDecimate,
      highPassHz: opts.envelopeHighPassHz,
      toleranceHz: opts.envelopeToleranceHz,
    });
    result.envelope = {
      envelope: e.envelope,
      envelopeSampleRateHz: e.spectrum.sampleRateHz,
      spectrum: e.spectrum,
      matches: e.matches,
      envelopeRms: e.envelopeRms,
      envelopeCrest: e.envelopeCrest,
      dominantEnvelopeHz: e.spectrum.dominantHz,
    };
    if (e.matches.length) {
      result.evidence.push(`Envelope demodulation: ${e.matches.map((m) => `${m.fault} at ${m.measuredHz.toFixed(2)} Hz (Δ ${m.distance.toFixed(3)} Hz, mag ${m.magnitude.toFixed(3)})`).join("; ")}.`);
      result.evidence.push(`Envelope RMS ${e.envelopeRms.toFixed(3)}, crest factor ${e.envelopeCrest.toFixed(2)} (impulsiveness).`);
    }
  }

  return result;
}
