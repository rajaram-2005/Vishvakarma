import { NextResponse } from "next/server";
import { getUserId, uidCookie } from "@/aetheris/lib/user";
import { accessWorkspace, addMember, listMembers, workspaceStats } from "@/aetheris/core/workspaces/workspaces";
import { authorize, principalFor } from "@/aetheris/core/policy/permissions";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** GET → { owner, members, role } for a workspace you own or are a member of. POST { member, role } → share (owner only). */
export async function GET(_req: Request, { params }: Ctx) {
  const { uid, isNew } = await getUserId();
  const id = decodeURIComponent((await params).id);
  const access = await accessWorkspace(uid, id);
  if (!access) return NextResponse.json({ error: "not found" }, { status: 404 });
  const list = await listMembers(uid, id);
  const res = NextResponse.json({ ...list, role: access.role });
  if (isNew) res.cookies.set(uidCookie(uid));
  return res;
}

export async function POST(req: Request, { params }: Ctx) {
  const { uid, isNew } = await getUserId();
  const id = decodeURIComponent((await params).id);
  const decision = authorize({ principal: principalFor(uid), capabilityId: "workspace:share", required: "safe_write" });
  if (!decision.allow) return NextResponse.json({ error: decision.reason, code: (decision as { code?: string }).code }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as { member?: string; role?: string };
  if (!b.member) return NextResponse.json({ error: "member required" }, { status: 400 });
  try {
    const w = await addMember(uid, id, { member: b.member, role: b.role });
    const res = NextResponse.json({ workspace: w, stats: await workspaceStats(uid, w) }, { status: 201 });
    if (isNew) res.cookies.set(uidCookie(uid));
    return res;
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
