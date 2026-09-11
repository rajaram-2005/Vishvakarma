import { NextResponse } from "next/server";
import { getUserId } from "@/aetheris/lib/user";
import { accessWorkspace, removeMember, setMemberRole, workspaceStats } from "@/aetheris/core/workspaces/workspaces";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string; member: string }> };

/** PATCH { role } → change a member's role (owner only). DELETE → remove the member, or leave. */
export async function PATCH(req: Request, { params }: Ctx) {
  const { uid } = await getUserId();
  const p = await params;
  const access = await accessWorkspace(uid, decodeURIComponent(p.id));
  if (!access) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (access.role !== "owner") return NextResponse.json({ error: "only the owner can change roles" }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as { role?: string };
  try {
    const w = await setMemberRole(uid, decodeURIComponent(p.id), decodeURIComponent(p.member), b.role ?? "");
    return NextResponse.json({ workspace: w });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { uid } = await getUserId();
  const p = await params;
  const id = decodeURIComponent(p.id);
  const member = decodeURIComponent(p.member);
  const w = await removeMember(uid, id, member);
  if (!w) return NextResponse.json({ error: "not found or not allowed" }, { status: 404 });
  return NextResponse.json({ ok: true, workspace: w, stats: await workspaceStats(w.uid, w) });
}
