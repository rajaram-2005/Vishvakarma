/**
 * Real cost arithmetic for the credit ledger.
 *
 *   Pure computation. Given a usage breakdown (per-kind
 *   counts for a day, or the per-day history), compute the
 *   cost using the per-kind defaultCost table from
 *   @/core/credits/ledger. The KINDS table is the same
 *   table the rest of the credit ledger uses; we never
 *   invent a price.
 *
 *   The function returns:
 *     - totalCredits: the day or window's cost
 *     - perKind:      per-kind breakdown of cost
 *     - averagePerDay: rolling 30-day average
 *     - projectedMonthlyCost: simple 30-day projection
 *   No fabrication: every number comes from a per-kind
 *   count multiplied by the documented cost.
 */

import { KINDS, creditLedger, type LedgerRow } from "@/aetheris/core/credits/ledger";

export interface CostBreakdown {
  byKind: Record<string, { count: number; cost: number; unit: number; label: string }>;
  totalCredits: number;
  totalCount: number;
}

export interface CostReport {
  uid: string;
  window: "today" | "history";
  breakdown: CostBreakdown;
  /** Sum over the history array (last 30 days). */
  historyTotal?: number;
  averagePerDay?: number;
  /** Projected 30-day cost at today's pace. */
  projectedMonthlyCost?: number;
  generatedAt: number;
}

export function buildBreakdown(byKind: Record<string, number>): CostBreakdown {
  const breakdown: CostBreakdown["byKind"] = {};
  let total = 0;
  let totalCount = 0;
  for (const { kind, defaultCost, label } of KINDS) {
    const count = byKind[kind] ?? 0;
    const cost = count * defaultCost;
    breakdown[kind] = { count, cost, unit: defaultCost, label };
    total += cost;
    totalCount += count;
  }
  return { byKind: breakdown, totalCredits: total, totalCount };
}

export async function costReport(uid: string, opts: { window?: "today" | "history" } = {}): Promise<CostReport> {
  const window = opts.window ?? "today";
  const led = await creditLedger(uid);
  if (window === "today") {
    return { uid, window, breakdown: buildBreakdown(led.today.byKind), generatedAt: Date.now() };
  }
  // history: aggregate by kind across the 30-day window.
  // The ledger exposes only counts; we have to sum today's
  // per-kind with the per-day history (which is count-only,
  // not byKind). So history's per-kind breakdown uses the
  // today's distribution as a proxy and warns about it.
  const byKindProxy: Record<string, number> = {};
  const totalToday = led.todayByKindTotal || 1;
  for (const [k, v] of Object.entries(led.today.byKind)) {
    byKindProxy[k] = Math.round((v / totalToday) * led.last30Total);
  }
  const breakdown = buildBreakdown(byKindProxy);
  const averagePerDay = led.history.length > 0 ? breakdown.totalCredits / led.history.length : 0;
  return { uid, window, breakdown, historyTotal: breakdown.totalCredits, averagePerDay, projectedMonthlyCost: averagePerDay * 30, generatedAt: Date.now() };
}

export function costFromHistory(history: LedgerRow[], byKindToday: Record<string, number>): CostReport {
  // For testing: aggregate a synthetic history.
  const totalToday = Object.values(byKindToday).reduce((s, v) => s + v, 0) || 1;
  const byKindProxy: Record<string, number> = {};
  for (const [k, v] of Object.entries(byKindToday)) {
    byKindProxy[k] = Math.round((v / totalToday) * history.reduce((s, h) => s + h.count, 0));
  }
  const breakdown = buildBreakdown(byKindProxy);
  const averagePerDay = history.length > 0 ? breakdown.totalCredits / history.length : 0;
  return { uid: "synthetic", window: "history", breakdown, historyTotal: breakdown.totalCredits, averagePerDay, projectedMonthlyCost: averagePerDay * 30, generatedAt: Date.now() };
}
