import { NextResponse } from "next/server";
import { getUserId } from "@/aetheris/lib/user";
import { deleteKb, getKb, removeDocument, saveKb } from "@/aetheris/lib/kb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

async function own(id: string) { const { uid } = await getUserId(); const kb = await getKb(id); return kb && kb.uid === uid ? kb : null; }

/** GET → KB (docs, no chunks). PATCH {name?, description?, deleteDoc?}. DELETE. */
export async function GET(_r: Request, { params }: Ctx) {
  const kb = await own((await params).id); if (!kb) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { chunks, ...lite } = kb;
  return NextResponse.json({ kb: { ...lite, totalChunks: chunks.length } });
}
export async function PATCH(req: Request, { params }: Ctx) {
  const kb = await own((await params).id); if (!kb) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const b = (await req.json().catch(() => ({}))) as { name?: string; description?: string; deleteDoc?: string };
  if (typeof b.name === "string" && b.name.trim()) kb.name = b.name.trim().slice(0, 80);
  if (typeof b.description === "string") kb.description = b.description.slice(0, 400);
  if (typeof b.deleteDoc === "string") removeDocument(kb, b.deleteDoc);
  await saveKb(kb);
  const { chunks, ...lite } = kb;
  return NextResponse.json({ kb: { ...lite, totalChunks: chunks.length } });
}
export async function DELETE(_r: Request, { params }: Ctx) {
  const kb = await own((await params).id); if (!kb) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await deleteKb(kb.id);
  return NextResponse.json({ ok: true });
}
