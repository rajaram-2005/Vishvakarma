import { NextResponse } from "next/server";
import { getUserId } from "@/aetheris/lib/user";
import { getDeck, reviewCard } from "@/aetheris/lib/study/engine";
import { deckStats, type Grade } from "@/aetheris/lib/study/srs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST {cardId, grade: 0|1|2|3} → updated SRS state for the card. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { uid } = await getUserId(); const d = await getDeck((await params).id);
  if (!d || d.uid !== uid) return NextResponse.json({ error: "not found" }, { status: 404 });
  const b = (await req.json().catch(() => ({}))) as { cardId?: string; grade?: number };
  const g = Number(b.grade); if (!b.cardId || !(g >= 0 && g <= 3)) return NextResponse.json({ error: "cardId and grade 0–3 required" }, { status: 400 });
  try { const c = await reviewCard(d, b.cardId, g as Grade); return NextResponse.json({ card: c, stats: deckStats(d.cards) }); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 404 }); }
}
