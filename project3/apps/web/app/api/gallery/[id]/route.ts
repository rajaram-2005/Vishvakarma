import { NextResponse } from "next/server";
import { getUserId } from "@/aetheris/lib/user";
import { isAdmin } from "@/aetheris/lib/billing/admin";
import { store } from "@/aetheris/lib/store";
import type { GalleryItem } from "../route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const COL = "gallery";

/** POST { action: "use" | "like" } */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const { uid } = await getUserId();
  const { action } = (await req.json().catch(() => ({}))) as { action?: string };
  if (!(await store.get<GalleryItem>(COL, id))) return NextResponse.json({ error: "not found" }, { status: 404 });
  const item = await store.update<GalleryItem>(COL, id, (i) => {
    if (!i) throw new Error("gone");
    if (action === "use") return { ...i, uses: i.uses + 1 };
    if (action === "like") { const by = new Set(i.likedBy ?? []); if (by.has(uid)) by.delete(uid); else by.add(uid); return { ...i, likedBy: [...by], likes: by.size }; }
    return i;
  });
  return NextResponse.json({ uses: item.uses, likes: item.likes, liked: item.likedBy?.includes(uid) ?? false });
}

/** DELETE — author or admin. */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const { uid } = await getUserId();
  const i = await store.get<GalleryItem>(COL, id);
  if (!i) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (i.author.uid !== uid && !(await isAdmin(req))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  await store.remove(COL, id);
  return NextResponse.json({ ok: true });
}
