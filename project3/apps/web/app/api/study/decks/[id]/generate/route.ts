import { NextResponse } from "next/server";
import { getUserId } from "@/aetheris/lib/user";
import { consumeChat, planFor } from "@/aetheris/lib/billing/entitlements";
import { resolveTier } from "@/aetheris/lib/models/tiers";
import { generateCards, getDeck, type CardKind } from "@/aetheris/lib/study/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST {count?, kinds?, focus?, adaptive?} → generates cards with the deck's tutor agent. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { uid } = await getUserId(); const d = await getDeck((await params).id);
  if (!d || d.uid !== uid) return NextResponse.json({ error: "not found" }, { status: 404 });
  const b = (await req.json().catch(() => ({}))) as { count?: number; kinds?: CardKind[]; focus?: string; adaptive?: boolean; model?: string };
  const plan = await planFor(uid); const { tier } = resolveTier(b.model, plan.id);
  const quota = await consumeChat(uid, 1, "agents");
  if (!quota.allowed) return NextResponse.json({ error: "Daily limit reached." }, { status: 402 });
  try { const r = await generateCards(d, { ...b, allow: tier.providers, allowKeyless: tier.allowKeyless, signal: req.signal }); return NextResponse.json({ added: r.added, cards: r.cards, provider: r.provider, total: d.cards.length }); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 502 }); }
}
