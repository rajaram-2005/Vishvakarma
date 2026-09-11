import { NextResponse } from "next/server";
import { getUserId } from "@/aetheris/lib/user";
import { consumeChat, planFor } from "@/aetheris/lib/billing/entitlements";
import { resolveTier } from "@/aetheris/lib/models/tiers";
import { getDeck, gradeAnswer, reviewCard } from "@/aetheris/lib/study/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST {cardId, answer} → grades a typed answer (exact match, else the tutor grades) and records the review. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { uid } = await getUserId(); const d = await getDeck((await params).id);
  if (!d || d.uid !== uid) return NextResponse.json({ error: "not found" }, { status: 404 });
  const b = (await req.json().catch(() => ({}))) as { cardId?: string; answer?: string; model?: string };
  const card = d.cards.find((c) => c.id === b.cardId); if (!card) return NextResponse.json({ error: "card not found" }, { status: 404 });
  const plan = await planFor(uid); const { tier } = resolveTier(b.model, plan.id);
  if (card.kind === "short" || card.kind === "flashcard") { const q = await consumeChat(uid, 1, "chat"); if (!q.allowed) return NextResponse.json({ error: "Daily limit reached." }, { status: 402 }); }
  try {
    const g = await gradeAnswer(d, card, String(b.answer ?? ""), { allow: tier.providers, allowKeyless: tier.allowKeyless });
    const updated = await reviewCard(d, card.id, g.correct ? 2 : 0);
    return NextResponse.json({ ...g, card: updated });
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 502 }); }
}
