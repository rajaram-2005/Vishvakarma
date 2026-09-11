import { NextResponse } from "next/server";
import { CONCEPTS, GROUP_LABEL, conceptById, conceptMarkdown, searchConcepts } from "@/aetheris/lib/concepts";

export const dynamic = "force-dynamic";

/** GET /api/concepts?q=&id= → the Explained-AI knowledge base (public, no auth). */
export async function GET(req: Request) {
  const u = new URL(req.url); const id = u.searchParams.get("id"); const q = u.searchParams.get("q") ?? "";
  if (id) { const c = conceptById(id); return c ? NextResponse.json({ ...c, markdown: conceptMarkdown(c) }) : NextResponse.json({ error: "not found" }, { status: 404 }); }
  const list = searchConcepts(q);
  return NextResponse.json({ groups: GROUP_LABEL, count: CONCEPTS.length, concepts: list.map(({ body: _b, ...c }) => c) });
}
