import { NextResponse } from "next/server";
import { getUserId } from "@/aetheris/lib/user";
import { deleteDeck, getDeck, saveDeck } from "@/aetheris/lib/study/engine";
import { buildQueue, deckStats } from "@/aetheris/lib/study/srs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** GET → deck + today's review queue. PATCH {title?, scope?, deleteCard?} . DELETE. */
export async function GET(_: Request, { params }: Ctx) {
  const { uid } = await getUserId(); const d = await getDeck((await params).id);
  if (!d || d.uid !== uid) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ deck: d, queue: buildQueue(d.cards).map((c) => c.id), stats: deckStats(d.cards) });
}
export async function PATCH(req: Request, { params }: Ctx) {
  const { uid } = await getUserId(); const d = await getDeck((await params).id);
  if (!d || d.uid !== uid) return NextResponse.json({ error: "not found" }, { status: 404 });
  const b = (await req.json().catch(() => ({}))) as { title?: string; scope?: string; deleteCard?: string };
  if (b.title) d.title = b.title.slice(0, 120); if (typeof b.scope === "string") d.scope = b.scope.slice(0, 4000);
  if (b.deleteCard) d.cards = d.cards.filter((c) => c.id !== b.deleteCard);
  await saveDeck(d); return NextResponse.json({ deck: d });
}
export async function DELETE(_: Request, { params }: Ctx) {
  const { uid } = await getUserId(); const d = await getDeck((await params).id);
  if (!d || d.uid !== uid) return NextResponse.json({ error: "not found" }, { status: 404 });
  await deleteDeck(d.id); return NextResponse.json({ ok: true });
}
