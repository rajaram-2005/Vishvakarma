/**
 * Timeline / Causal Replay engine.
 *
 *   Composes the existing diagnostic-history collection with the DEMO
 *   seed history to produce a unified timeline of a single asset's
 *   diagnostic events. The causal chain is reconstructed from the
 *   (severity, peakMagnitude, dominantHz) tuples:
 *
 *     severity: ok → watch → warning → critical  (progression)
 *     peak magnitude: rising                     (deterioration)
 *     dominant Hz: stable near bearing freq      (consistent fault)
 *
 *   Each timeline entry carries a "cause" annotation that links to the
 *   previous entry, so the UI can render the "WHY DID THIS HAPPEN?"
 *   surface from the original Aetheris vision section 26-38.
 */

import { getHistory, type DiagnosticHistoryEntry } from "@/aetheris/core/diagnostics/history";
import { bearingFaultFrequencies } from "@/aetheris/core/diagnostics/fft";
import type { Severity } from "@/aetheris/core/diagnostics/engine";

export interface TimelineEvent {
  /** ISO date string for UI display. */
  iso: string;
  /** Unix ms. */
  tMs: number;
  /** Severity at this point. */
  severity: Severity;
  /** Peak magnitude (mm/s for vibration). */
  peakMagnitude: number;
  /** Dominant frequency (Hz), may be null. */
  dominantHz: number | null;
  /** Top fault label, may be null. */
  topFault: string | null;
  /** Causal note: what the previous entry tells us. */
  cause: string;
  /** Time since previous entry, in hours (null if first). */
  deltaH: number | null;
  /** Rotor RPM at the time (best-effort from history, default 1500). */
  rotorRpm: number;
}

export interface TimelineRun {
  twinId: string;
  twinName: string;
  rotorRpm: number;
  bearingFreqs: { outerRace: number; innerRace: number; ballSpin: number; cage: number };
  events: TimelineEvent[];
  /** Severity progression: e.g. ["ok","watch","warning","critical"]. */
  progression: Severity[];
  /** When the run was assembled. */
  assembledAt: number;
  /** Is the trajectory monotonically worsening? (for the verdict). */
  monotonicWorsening: boolean;
}

const SEV_ORDER: Record<Severity, number> = { ok: 0, watch: 1, warning: 2, critical: 3 };

/** Sort the history ascending by tMs. */
function sortAsc(events: DiagnosticHistoryEntry[]): DiagnosticHistoryEntry[] {
  return events.slice().sort((a, b) => a.tMs - b.tMs);
}

/** Compose the unified timeline. */
export async function buildTimeline(opts: { twinId: string; twinName?: string; rotorRpm?: number }): Promise<TimelineRun> {
  const twinId = opts.twinId;
  const rotorRpm = opts.rotorRpm ?? 1500;
  const faultFreqs = bearingFaultFrequencies(rotorRpm);
  const history = sortAsc(await getHistory(twinId, { limit: 200 }));
  const events: TimelineEvent[] = [];
  for (let i = 0; i < history.length; i++) {
    const h = history[i]!;
    const prev = i > 0 ? history[i - 1]! : null;
    const deltaH = prev ? (h.tMs - prev.tMs) / 3_600_000 : null;
    const cause = prev
      ? `Severity ${prev.severity} → ${h.severity}, peak ${prev.peakMagnitude.toFixed(1)} → ${h.peakMagnitude.toFixed(1)} mm/s. ${dominantConsistent(prev.dominantHz, h.dominantHz, faultFreqs.outerRace)}.`
      : "Initial diagnostic on this asset.";
    events.push({
      iso: new Date(h.tMs).toISOString(),
      tMs: h.tMs,
      severity: h.severity,
      peakMagnitude: h.peakMagnitude,
      dominantHz: h.dominantHz,
      topFault: h.topFault,
      cause,
      deltaH,
      rotorRpm,
    });
  }
  const progression = events.map((e) => e.severity);
  const monotonicWorsening = isMonotonicNondecreasing(progression);
  return {
    twinId,
    twinName: opts.twinName ?? twinId,
    rotorRpm,
    bearingFreqs: faultFreqs,
    events,
    progression,
    assembledAt: Date.now(),
    monotonicWorsening,
  };
}

function dominantConsistent(prev: number | null, curr: number | null, expected: number): string {
  if (prev === null || curr === null) return "dominant frequency not yet established";
  const bothNear = Math.abs(prev - expected) < 5 && Math.abs(curr - expected) < 5;
  return bothNear ? "dominant frequency stable near BPFO" : "dominant frequency drifted";
}

function isMonotonicNondecreasing(progression: Severity[]): boolean {
  for (let i = 1; i < progression.length; i++) {
    if (SEV_ORDER[progression[i]!] < SEV_ORDER[progression[i - 1]!]) return false;
  }
  return true;
}
