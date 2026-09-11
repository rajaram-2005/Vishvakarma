import { NextResponse } from "next/server";
import { getUserId } from "@/aetheris/lib/user";
import { getKb, retrieve } from "@/aetheris/lib/kb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** GET ?q=…&k=6 → ranked passages (for the UI preview and for tools). */
export async function GET(req: Request, { params }: Ctx) {
  const { uid } = await getUserId();
  const kb = await getKb((await params).id);
  if (!kb || kb.uid !== uid) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const u = new URL(req.url); const q = u.searchParams.get("q") ?? ""; const k = Math.min(20, Math.max(1, Number(u.searchParams.get("k") ?? 6)));
  if (!q.trim()) return NextResponse.json({ hits: [] });
  return NextResponse.json({ hits: retrieve(kb, q, k).map((h) => ({ score: Math.round(h.score * 100) / 100, doc: h.doc.name, page: h.chunk.page, section: h.chunk.section, chunkId: h.chunk.id, text: h.chunk.text })) });
}
