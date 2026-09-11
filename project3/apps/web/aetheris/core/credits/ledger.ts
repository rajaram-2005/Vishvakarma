/**
 * Cost / Credit Ledger.
 *
 *   Read-side view over the production `usage:<uid>` store. The
 *   ledger shows the user's plan, the current day's usage, the
 *   per-kind breakdown, and a 30-day history of daily totals.
 *
 *   The store's `Usage` shape is:
 *     { day: YYYY-MM-DD, count: number, byKind?: { chat: n, … },
 *       history?: [{ day, count }] }
 *
 *   `consumeChat()` is the only writer; we never write here.
 */

import { store } from "@/aetheris/lib/store";
import { planFor } from "@/aetheris/lib/billing/entitlements";

function isFreeForAllLocal(): boolean {
  // Mirror the production check: AETHERIS_PAID_PLANS=1 disables
  // the free-for-all mode. We read it lazily so a test that
  // mutates the env between calls sees the right value.
  return process.env.AETHERIS_PAID_PLANS !== "1";
}
import type { UsageKind } from "@/aetheris/lib/billing/entitlements";

interface Usage { day: string; count: number; byKind?: Record<string, number>; history?: { day: string; count: number }[] }

export interface LedgerRow {
  day: string;
  count: number;
}

export interface CreditLedger {
  uid: string;
  plan: { id: string; name: string; dailyCredits: number | null; maxModel: string };
  isFreeForAll: boolean;
  today: { day: string; count: number; byKind: Record<string, number> };
  history: LedgerRow[];
  /** Sum of history (last 30 days). */
  last30Total: number;
  /** Sum of today's byKind (which is also the byKind total). */
  todayByKindTotal: number;
  generatedAt: number;
}

export const KINDS: { kind: UsageKind; label: string; defaultCost: number }[] = [
  { kind: "chat", label: "Chat", defaultCost: 1 },
  { kind: "agents", label: "Agents", defaultCost: 2 },
  { kind: "research", label: "Research", defaultCost: 5 },
  { kind: "arena", label: "Arena", defaultCost: 1 },
  { kind: "factory", label: "Factory", defaultCost: 10 },
  { kind: "media", label: "Media", defaultCost: 5 },
  { kind: "api", label: "API", defaultCost: 1 },
];

export async function creditLedger(uid: string): Promise<CreditLedger> {
  const plan = await planFor(uid);
  const usage = await store.get<Usage>("usage", uid);
  const today = usage ?? { day: new Date().toISOString().slice(0, 10), count: 0, byKind: {} };
  const byKind = today.byKind ?? {};
  const history = (usage?.history ?? []).slice(-30);
  const last30Total = history.reduce((s, h) => s + h.count, 0);
  const todayByKindTotal = Object.values(byKind).reduce((s, v) => s + v, 0);
  return {
    uid,
    plan: { id: plan.id, name: plan.name, dailyCredits: plan.dailyCredits, maxModel: plan.maxModel },
    isFreeForAll: isFreeForAllLocal(),
    today: { day: today.day, count: today.count, byKind },
    history,
    last30Total,
    todayByKindTotal,
    generatedAt: Date.now(),
  };
}
