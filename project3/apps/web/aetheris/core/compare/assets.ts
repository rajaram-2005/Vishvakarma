/**
 * Asset Comparison engine.
 *
 *   Side-by-side comparison of two digital twins. For each twin, the
 *   engine composes:
 *     - the live state (key health channels)
 *     - the latest diagnostic (severity, peak, dominant Hz)
 *     - the diagnostic history (sparkline of peak magnitude)
 *     - the simulated health score
 *
 *   This is a real read of the production state — no fabricated
 *   comparisons. If a twin is missing, the missing field is left
 *   as `null` and the UI shows "—".
 */

import { getHistory } from "@/aetheris/core/diagnostics/history";
import { bearingFaultFrequencies } from "@/aetheris/core/diagnostics/fft";
import { getTwin } from "@/aetheris/core/twins/twins";
import { twinHealth } from "@/aetheris/core/twins/twins";

export interface AssetSnapshot {
  twinId: string;
  twinName: string;
  kind: string;
  /** Live state channels. */
  state: {
    rotor_rpm: number | null;
    vib_bearing_mms: number | null;
    T_gearbox_K: number | null;
    P_active_kW: number | null;
    oil_pressure_kPa: number | null;
  };
  /** Health score 0-100. */
  health: number;
  /** Stale? (no recent telemetry) */
  stale: boolean;
  /** Last diagnostic. */
  lastDiagnostic: { severity: string; peakMagnitude: number; tMs: number; dominantHz: number | null } | null;
  /** History sparkline (peak magnitude, last 20 readings). */
  historySparkline: number[];
  /** History count. */
  historyCount: number;
  /** Critical-events-in-24h. */
  criticalEvents24h: number;
  /** True if any bound is currently in critical breach. */
  inCriticalBreach: boolean;
  /** Bearing BPFO at the configured rotor. */
  bpfoHz: number | null;
}

export interface Comparison {
  a: AssetSnapshot | null;
  b: AssetSnapshot | null;
  /** Twin a is healthier than twin b. */
  aIsHealthier: boolean;
  /** Both twins share the same dominant fault signature. */
  sameFaultSignature: boolean;
  /** When the comparison was assembled. */
  assembledAt: number;
}

async function snapshot(twinId: string, rotorRpm: number): Promise<AssetSnapshot | null> {
  const twin = await getTwin(twinId);
  if (!twin) return null;
  const health = twinHealth(twin);
  const history = await getHistory(twinId, { limit: 20 });
  const last = history.length ? history[history.length - 1]! : null;
  const state = twin.state;
  const s = (k: string) => (typeof state[k] === "number" ? Number(state[k]) : null);
  return {
    twinId,
    twinName: twin.name,
    kind: twin.kind,
    state: {
      rotor_rpm: s("rotor_rpm"),
      vib_bearing_mms: s("vib_bearing_mms"),
      T_gearbox_K: s("T_gearbox_K"),
      P_active_kW: s("P_active_kW"),
      oil_pressure_kPa: s("oil_pressure_kPa"),
    },
    health: health.score,
    stale: health.stale,
    lastDiagnostic: last ? { severity: last.severity, peakMagnitude: last.peakMagnitude, tMs: last.tMs, dominantHz: last.dominantHz } : null,
    historySparkline: history.map((h) => h.peakMagnitude),
    historyCount: history.length,
    criticalEvents24h: health.criticalEvents24h,
    inCriticalBreach: health.breaches.some((b) => b.critical),
    bpfoHz: bearingFaultFrequencies(rotorRpm).outerRace,
  };
}

export async function compareAssets(opts: { twinIdA: string; twinIdB: string; rotorRpm?: number }): Promise<Comparison> {
  const rotorRpm = opts.rotorRpm ?? 1500;
  const [a, b] = await Promise.all([snapshot(opts.twinIdA, rotorRpm), snapshot(opts.twinIdB, rotorRpm)]);
  const aIsHealthier = !!(a && b && a.health > b.health);
  const sameFaultSignature = !!(a?.lastDiagnostic?.dominantHz && b?.lastDiagnostic?.dominantHz && Math.abs((a.lastDiagnostic.dominantHz - (a.bpfoHz ?? 0))) < 5 && Math.abs((b.lastDiagnostic.dominantHz - (b.bpfoHz ?? 0))) < 5);
  return {
    a,
    b,
    aIsHealthier,
    sameFaultSignature,
    assembledAt: Date.now(),
  };
}

/** SVG sparkline path (same convention as the world-model engine). */
export function sparklinePath(values: number[], width: number, height: number, padding = 2): string {
  if (values.length === 0) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const w = width - padding * 2;
  const h = height - padding * 2;
  return values
    .map((v, i) => {
      const x = padding + (i / Math.max(1, values.length - 1)) * w;
      const y = padding + (1 - (v - min) / span) * h;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}
