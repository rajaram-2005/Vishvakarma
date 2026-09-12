import { NextResponse } from "next/server";
import { getUserId, uidCookie } from "@/aetheris/lib/user";
import { createWorkspace, listWorkspaces, workspaceStats } from "@/aetheris/core/workspaces/workspaces";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";

/** GET → {workspaces:[{...,stats}]}   POST {name, description?, tags?} → {workspace} 201 */
export async function GET() {
  const { uid, isNew } = await getUserId();
  const ws = await listWorkspaces(uid);
  const workspaces = await Promise.all(ws.map(async (w) => ({ ...w, stats: await workspaceStats(uid, w) })));
  const res = NextResponse.json({ workspaces }); if (isNew) res.cookies.set(uidCookie(uid)); return res;
}
export async function POST(req: Request) {
  const { uid, isNew } = await getUserId();
  const b = (await req.json().catch(() => ({}))) as { name?: string; description?: string; tags?: string[] };
  if (!b.name) return NextResponse.json({ error: "name required" }, { status: 400 });
  try { const res = NextResponse.json({ workspace: await createWorkspace(uid, { name: b.name, description: b.description, tags: b.tags }) }, { status: 201 }); if (isNew) res.cookies.set(uidCookie(uid)); return res; }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}
