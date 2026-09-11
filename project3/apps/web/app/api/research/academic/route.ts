import { NextResponse } from "next/server";
import { research } from "@/aetheris/core/research/engine";
import { searchKeyFor } from "@/aetheris/lib/search/tavily";
import { getUserId, uidCookie } from "@/aetheris/lib/user";
export const runtime = "nodejs"; export const dynamic = "force-dynamic"; export const maxDuration = 300;

/**
 * POST {topic, searchKey?, preferred?, perSource?, web?, persist?} → ResearchReport
 * Academic sources (arXiv, Crossref, OpenAlex, Semantic Scholar) need no key; web evidence is added when a Tavily key exists.
 * persist=true stores each claim as a fact in the knowledge fabric (provenance kind "research").
 */
export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as { topic?: string; searchKey?: string; preferred?: string; perSource?: number; web?: boolean; persist?: boolean };
  const topic = (b.topic ?? "").trim(); if (!topic) return NextResponse.json({ error: "topic required" }, { status: 400 });
  const { uid, isNew } = await getUserId();
  try {
    const rep = await research({ topic, searchKey: searchKeyFor(b.searchKey), preferred: b.preferred, perSource: Math.min(10, b.perSource ?? 6), web: b.web });
    let persisted = 0;
    if (b.persist) { try { const { addFact } = await import("@/aetheris/core/knowledge/fabric"); for (const c of rep.claims) { await addFact({ uid, text: c.text, tags: ["research", c.stance], provenance: { kind: "research", ref: c.support.join(","), confidence: c.confidence, by: `${rep.provider}/${rep.model}` } }); persisted++; } } catch { /* fabric unavailable */ } }
    const res = NextResponse.json({ ...rep, persisted }); if (isNew) res.cookies.set(uidCookie(uid)); return res;
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 502 }); }
}
