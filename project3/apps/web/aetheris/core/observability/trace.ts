/**
 * Reasoning Trace viewer.
 *
 *   A read-side helper that turns the production
 *   observability event log into a "reasoning trace": a
 *   chronologically-ordered list of (capability, ok, ms,
 *   detail) tuples for the chosen uid. The trace is exactly
 *   what the agent did — no fabrication.
 *
 *   The viewer groups events by parent capability, computes
 *   per-step duration, and surfaces failures.
 */

import { query, queryAsync, type AetherisEvent, type EventType } from "@/aetheris/core/observability/events";

export interface TraceStep {
  id: string;
  at: number;
  type: EventType;
  capability: string;
  ok: boolean;
  ms: number | null;
  detail: string | null;
}

export interface TraceGroup {
  capability: string;
  steps: TraceStep[];
  totalMs: number;
  okCount: number;
  failCount: number;
  firstAt: number;
  lastAt: number;
}

export interface TraceReport {
  uid: string;
  total: number;
  okCount: number;
  failCount: number;
  totalMs: number;
  groups: TraceGroup[];
  recentSteps: TraceStep[];
  /** ms span of the trace (last at − first at). */
  spanMs: number;
  /** Earliest at in the trace, or 0 if empty. */
  firstAt: number;
  generatedAt: number;
}

function stepFromEvent(e: AetherisEvent): TraceStep {
  return {
    id: e.id,
    at: e.at,
    type: e.type,
    capability: e.capability ?? "*",
    ok: e.ok,
    ms: e.ms ?? null,
    detail: e.detail ?? null,
  };
}

function groupKey(cap: string): string {
  // Capability strings look like "agent:Prime.chat" or
  // "twin:wtg-04.diagnose" or "tool:search.query". The first
  // segment before the first ':' is the system type
  // (agent / twin / tool / device / model / …); that is what
  // we want to group on.
  const colon = cap.indexOf(":");
  return colon > 0 ? cap.slice(0, colon) : cap;
}

export type TraceReportOpts = { limit?: number; type?: EventType; sinceMs?: number };

export function traceReport(uid: string, opts: TraceReportOpts = {}): TraceReport {
  return composeTraceReport(uid, query({ uid, type: opts.type, since: opts.sinceMs, limit: opts.limit ?? 200 }));
}

/** Async twin: identical output, reads the pg log in hosted mode. Routes and pages use this. */
export async function traceReportAsync(uid: string, opts: TraceReportOpts = {}): Promise<TraceReport> {
  return composeTraceReport(uid, await queryAsync({ uid, type: opts.type, since: opts.sinceMs, limit: opts.limit ?? 200 }));
}

function composeTraceReport(uid: string, events: AetherisEvent[]): TraceReport {
  const steps = events.map(stepFromEvent);
  const okCount = steps.filter((s) => s.ok).length;
  const failCount = steps.length - okCount;
  const totalMs = steps.reduce((s, x) => s + (x.ms ?? 0), 0);
  const firstAt = steps.length ? steps[steps.length - 1]!.at : 0;
  const lastAt = steps.length ? steps[0]!.at : 0;
  // Group
  const groupMap = new Map<string, TraceStep[]>();
  for (const s of steps) {
    const k = groupKey(s.capability);
    if (!groupMap.has(k)) groupMap.set(k, []);
    groupMap.get(k)!.push(s);
  }
  const groups: TraceGroup[] = [];
  for (const [k, list] of groupMap.entries()) {
    list.sort((a, b) => a.at - b.at);
    groups.push({
      capability: k,
      steps: list,
      totalMs: list.reduce((s, x) => s + (x.ms ?? 0), 0),
      okCount: list.filter((s) => s.ok).length,
      failCount: list.filter((s) => !s.ok).length,
      firstAt: list[0]!.at,
      lastAt: list[list.length - 1]!.at,
    });
  }
  groups.sort((a, b) => b.lastAt - a.lastAt);
  return {
    uid,
    total: steps.length,
    okCount,
    failCount,
    totalMs,
    groups,
    recentSteps: steps,
    spanMs: lastAt - firstAt,
    firstAt,
    generatedAt: Date.now(),
  };
}
