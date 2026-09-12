/**
 * Fleet Overview.
 *
 *   Real aggregation of every twin in the user's fleet. Each
 *   twin contributes:
 *     - twin meta (id, name, kind, last update)
 *     - health score + breach list + overdue maintenance count
 *     - last diagnostic (severity, peak magnitude, dominant Hz,
 *       top fault)
 *     - critical events in the last 24 h
 *     - bound-breach count by severity
 *
 *   The overview also produces a fleet rollup: total count,
 *   count by health band (good / watch / warning / critical),
 *   count with overdue maintenance, count with critical
 *   diagnostics, and the worst twin in the fleet.
 */

import { getHistory } from "@/aetheris/core/diagnostics/history";
import { listTwins, twinHealth, type Twin } from "@/aetheris/core/twins/twins";

export interface FleetTwinRow {
  twin: { id: string; name: string; kind: string; updatedAt: number; lastAt: number | undefined };
  health: number;
  stale: boolean;
  breachCount: number;
  criticalBreachCount: number;
  overdueMaintenance: number;
  criticalEvents24h: number;
  lastDiagnostic: { tMs: number; severity: string; peakMagnitude: number; dominantHz: number | null; topFault: string | null } | null;
}

export type HealthBand = "good" | "watch" | "warning" | "critical";

export function healthBand(score: number): HealthBand {
  if (score >= 80) return "good";
  if (score >= 60) return "watch";
  if (score >= 30) return "warning";
  return "critical";
}

export const HEALTH_BAND_COLOUR: Record<HealthBand, string> = {
  good: "#4ade80",
  watch: "#facc15",
  warning: "#fb923c",
  critical: "#f87171",
};

export interface FleetOverview {
  uid: string;
  total: number;
  byBand: Record<HealthBand, number>;
  withOverdueMaintenance: number;
  withCriticalDiagnostic: number;
  worst: FleetTwinRow | null;
  rows: FleetTwinRow[];
  assembledAt: number;
}

async function buildRow(twin: Twin): Promise<FleetTwinRow> {
  const h = twinHealth(twin);
  const history = await getHistory(twin.id, { limit: 1 });
  const last = history[0] ?? null;
  return {
    twin: { id: twin.id, name: twin.name, kind: twin.kind, updatedAt: twin.updatedAt, lastAt: h.lastAt },
    health: h.score,
    stale: h.stale,
    breachCount: h.breaches.length,
    criticalBreachCount: h.breaches.filter((b) => b.critical).length,
    overdueMaintenance: h.overdueMaintenance.length,
    criticalEvents24h: h.criticalEvents24h,
    lastDiagnostic: last ? { tMs: last.tMs, severity: last.severity, peakMagnitude: last.peakMagnitude, dominantHz: last.dominantHz, topFault: last.topFault } : null,
  };
}

export async function fleetOverview(uid: string): Promise<FleetOverview> {
  const twins = await listTwins(uid);
  const rows = await Promise.all(twins.map(buildRow));
  const byBand: Record<HealthBand, number> = { good: 0, watch: 0, warning: 0, critical: 0 };
  let withOverdueMaintenance = 0;
  let withCriticalDiagnostic = 0;
  let worst: FleetTwinRow | null = null;
  for (const r of rows) {
    byBand[healthBand(r.health)]++;
    if (r.overdueMaintenance > 0) withOverdueMaintenance++;
    if (r.lastDiagnostic && r.lastDiagnostic.severity === "critical") withCriticalDiagnostic++;
    if (!worst || r.health < worst.health) worst = r;
  }
  return {
    uid,
    total: rows.length,
    byBand,
    withOverdueMaintenance,
    withCriticalDiagnostic,
    worst,
    rows,
    assembledAt: Date.now(),
  };
}
