/**
 * Fusion observability composer.
 *
 *   A read-side composer that surfaces every recorded fusion
 *   call from the 'fusion-runs' collection alongside the
 *   observability event log entries that have capability =
 *   'fusion:orchestrate'. This lets the existing /trace
 *   page see every fusion call without any change to the
 *   trace engine.
 *
 *   The composer is read-side. It reads from the local
 *   store and the observability query; it never writes.
 */

import { queryAsync, type AetherisEvent } from "@/aetheris/core/observability/events";
import { store } from "@/aetheris/lib/store";

export interface FusionRun {
  uid: string;
  at: number;
  question: string;
  mode: "live" | "demo-seed";
  decision: "allow" | "allow-with-caveat" | "deny";
  uncertainty: number;
}

export interface FusionTrace {
  uid: string;
  total: number;
  events: AetherisEvent[];
  runs: FusionRun[];
  byDecision: Record<FusionRun["decision"], number>;
  byMode: Record<FusionRun["mode"], number>;
  generatedAt: number;
}

export async function fusionTrace(uid: string, opts: { limit?: number; sinceMs?: number } = {}): Promise<FusionTrace> {
  const limit = opts.limit ?? 50;
  const sinceMs = opts.sinceMs ?? 0;
  // 1) Pull every 'fusion:orchestrate' event for this uid.
  const allFusionEvents = await queryAsync({ uid, capability: "fusion:orchestrate", since: sinceMs, limit: 1000 });
  const events = allFusionEvents.slice(0, limit);
  // 2) Pull every recorded fusion run.
  const allRuns = await store.all<FusionRun>("fusion-runs");
  const runs: FusionRun[] = Object.values(allRuns)
    .filter((r) => r.uid === uid && r.at >= sinceMs)
    .sort((a, b) => b.at - a.at)
    .slice(0, limit);
  // 3) Rollup.
  const byDecision: Record<FusionRun["decision"], number> = { allow: 0, "allow-with-caveat": 0, deny: 0 };
  const byMode: Record<FusionRun["mode"], number> = { live: 0, "demo-seed": 0 };
  for (const r of runs) {
    byDecision[r.decision] = (byDecision[r.decision] ?? 0) + 1;
    byMode[r.mode] = (byMode[r.mode] ?? 0) + 1;
  }
  return { uid, total: runs.length, events, runs, byDecision, byMode, generatedAt: Date.now() };
}
