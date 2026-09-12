import { NextResponse } from "next/server";
import { isAdmin } from "@/aetheris/lib/billing/admin";
import { store } from "@/aetheris/lib/store";
import { grant, type Entitlement } from "@/aetheris/lib/billing/entitlements";
import { PLANS } from "@/aetheris/lib/billing/plans";

export const dynamic = "force-dynamic";

/** GET → all active entitlements + today's usage; POST {uid, planId} → manual grant (or planId "free" to revoke). */
export async function GET(req: Request) {
  if (!(await isAdmin(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const ents = Object.values(await store.all<Entitlement>("entitlements"));
  const usage = await store.all<{ day: string; count: number }>("usage");
  const keys = Object.values(await store.all<{ uid: string }>("apikeys"));
  const today = new Date().toISOString().slice(0, 10);
  const users = ents.map((e) => ({ ...e, active: e.expiresAt > Date.now(), usedToday: usage[e.uid]?.day === today ? usage[e.uid].count : 0, apiKeys: keys.filter((k) => k.uid === e.uid).length }))
    .sort((a, b) => b.expiresAt - a.expiresAt);
  const totals = { users: users.filter((u) => u.active).length, mrrInr: users.filter((u) => u.active).reduce((n, u) => n + (PLANS.find((p) => p.id === u.planId)?.priceInr ?? 0), 0), activeToday: Object.values(usage).filter((u) => u.day === today).length };
  return NextResponse.json({ users, totals });
}

export async function POST(req: Request) {
  if (!(await isAdmin(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { uid, planId } = (await req.json().catch(() => ({}))) as { uid?: string; planId?: string };
  if (!uid || !planId) return NextResponse.json({ error: "uid and planId required" }, { status: 400 });
  if (planId === "free") { await store.remove("entitlements", uid); return NextResponse.json({ ok: true }); }
  try { return NextResponse.json(await grant(uid, planId, "admin")); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}
