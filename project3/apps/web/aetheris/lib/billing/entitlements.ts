import { store } from "@/aetheris/lib/store";
import { freeForAll, FREE_PLAN, PLANS, planById, type Feature, type Plan } from "./plans";

export interface Entitlement {
  uid: string;
  planId: string;
  expiresAt: number; // epoch ms
  grantedBy: string; // payment id or "admin"
}

export async function getEntitlement(uid: string): Promise<Entitlement | null> {
  const e = await store.get<Entitlement>("entitlements", uid);
  if (!e || e.expiresAt < Date.now()) return null;
  return e;
}

/** Effective plan (falls back to Free). */
const GOD = PLANS.find((p) => p.id === "god-mode")!;
/** Admins get God Mode everywhere, with no expiry and no metering. */
export async function isAdminUser(uid: string): Promise<boolean> {
  const { isAdminUid } = await import("./admin");
  return isAdminUid(uid);
}

export async function planFor(uid: string): Promise<Plan> {
  if (freeForAll()) return GOD;
  if (await isAdminUser(uid)) return GOD;
  const e = await getEntitlement(uid);
  return (e && planById(e.planId)) || FREE_PLAN;
}

export async function hasFeature(uid: string, f: Feature): Promise<boolean> {
  return (await planFor(uid)).features.includes(f);
}

export async function grant(uid: string, planId: string, grantedBy: string): Promise<Entitlement> {
  const plan = planById(planId);
  if (!plan || plan.priceInr === 0) throw new Error(`Unknown plan ${planId}`);
  return store.update<Entitlement>("entitlements", uid, (cur) => {
    const base = cur && cur.expiresAt > Date.now() && cur.planId === planId ? cur.expiresAt : Date.now();
    return { uid, planId, expiresAt: base + plan.days * 86_400_000, grantedBy };
  });
}

// ---- Metering (credits per day, plan-dependent) --------------------------------------------
interface Usage { day: string; count: number; byKind?: Record<string, number>; history?: { day: string; count: number }[] }
function today() { return new Date().toISOString().slice(0, 10); }

export type UsageKind = "chat" | "agents" | "research" | "arena" | "factory" | "media" | "api";

export async function consumeChat(uid: string, cost = 1, kind: UsageKind = "chat"): Promise<{ allowed: boolean; used: number; limit: number | null }> {
  const plan = await planFor(uid);
  if (freeForAll()) { // still record usage (nice stats), never refuse
    const u = await store.update<Usage>("usage", uid, (cur) => { const d = today(); if (!cur || cur.day !== d) return { day: d, count: cost, byKind: { [kind]: cost }, history: [...(cur?.history ?? []), ...(cur ? [{ day: cur.day, count: cur.count }] : [])].slice(-30) }; return { ...cur, count: cur.count + cost, byKind: { ...(cur.byKind ?? {}), [kind]: (cur.byKind?.[kind] ?? 0) + cost } }; });
    return { allowed: true, used: u.count, limit: null };
  }
  // Check before charging so an over-limit request does not inflate the counter.
  const cur0 = await store.get<Usage>("usage", uid);
  const usedToday = cur0 && cur0.day === today() ? cur0.count : 0;
  if (plan.dailyCredits !== null && usedToday + cost > plan.dailyCredits) return { allowed: false, used: usedToday, limit: plan.dailyCredits };
  const u = await store.update<Usage>("usage", uid, (cur) => {
    const d = today();
    if (!cur || cur.day !== d) {
      const history = [...(cur?.history ?? []), ...(cur ? [{ day: cur.day, count: cur.count }] : [])].slice(-30);
      return { day: d, count: cost, byKind: { [kind]: cost }, history };
    }
    return { ...cur, count: cur.count + cost, byKind: { ...(cur.byKind ?? {}), [kind]: (cur.byKind?.[kind] ?? 0) + cost } };
  });
  if (plan.dailyCredits === null) return { allowed: true, used: u.count, limit: null };
  return { allowed: u.count <= plan.dailyCredits, used: u.count, limit: plan.dailyCredits };
}

export async function usageSummary(uid: string) {
  const ent = await getEntitlement(uid);
  const plan = await planFor(uid);
  const u = await store.get<Usage>("usage", uid);
  const used = u && u.day === today() ? u.count : 0;
  return {
    plan: ent ? plan : null,
    planId: plan.id,
    expiresAt: ent?.expiresAt ?? null,
    features: plan.features,
    maxModel: plan.maxModel,
    maxAgents: plan.maxAgents,
    apiKeys: plan.apiKeys,
    chat: { used, limit: plan.dailyCredits },
    byKind: u && u.day === today() ? u.byKind ?? {} : {},
    history: u?.history ?? [],
    plans: PLANS,
  };
}
