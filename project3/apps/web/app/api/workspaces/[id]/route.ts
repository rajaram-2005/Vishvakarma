import { NextResponse } from "next/server";
import { getUserId } from "@/aetheris/lib/user";
import { deleteWorkspace, getWorkspace, updateWorkspace, workspaceStats } from "@/aetheris/core/workspaces/workspaces";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { uid } = await getUserId(); const w = await getWorkspace(uid, decodeURIComponent((await params).id));
  if (!w) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ workspace: { ...w, stats: await workspaceStats(uid, w) } });
}
export async function PATCH(req: Request, { params }: Ctx) {
  const { uid } = await getUserId(); const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const w = await updateWorkspace(uid, decodeURIComponent((await params).id), { name: b.name as string | undefined, description: b.description as string | undefined, tags: Array.isArray(b.tags) ? (b.tags as string[]).slice(0, 10) : undefined, archived: typeof b.archived === "boolean" ? b.archived : undefined });
  return w ? NextResponse.json({ workspace: w }) : NextResponse.json({ error: "not found" }, { status: 404 });
}
export async function DELETE(_req: Request, { params }: Ctx) {
  const { uid } = await getUserId(); const ok = await deleteWorkspace(uid, decodeURIComponent((await params).id));
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "not found or default workspace" }, { status: 404 });
}
