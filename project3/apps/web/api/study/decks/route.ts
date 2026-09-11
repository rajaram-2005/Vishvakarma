import { NextResponse } from "next/server";
import { getUserId, uidCookie } from "@/aetheris/lib/user";
import { createDeck, listDecks, STUDY_AGENTS } from "@/aetheris/lib/study/engine";
import { deckStats } from "@/aetheris/lib/study/srs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET → my decks with stats. POST {subject, title?, scope?, language?, agent?} → new deck. */
export async function GET() {
  const { uid, isNew } = await getUserId();
  const decks = (await listDecks(uid)).map((d) => ({ id: d.id, title: d.title, subject: d.subject, scope: d.scope, language: d.language, agent: d.agent, createdAt: d.createdAt, updatedAt: d.updatedAt, stats: deckStats(d.cards), history: d.history.slice(-30) }));
  const res = NextResponse.json({ decks, agents: STUDY_AGENTS });
  if (isNew) res.cookies.set(uidCookie(uid));
  return res;
}
export async function POST(req: Request) {
  const { uid, isNew } = await getUserId();
  const b = (await req.json().catch(() => ({}))) as { subject?: string; title?: string; scope?: string; language?: string; agent?: string };
  if (!b.subject?.trim()) return NextResponse.json({ error: "subject required" }, { status: 400 });
  const deck = await createDeck(uid, { subject: b.subject.trim(), title: b.title?.trim(), scope: b.scope, language: b.language, agent: b.agent });
  const res = NextResponse.json({ deck });
  if (isNew) res.cookies.set(uidCookie(uid));
  return res;
}
