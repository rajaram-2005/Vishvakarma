import { NextResponse } from "next/server";
import { getUserId } from "@/aetheris/lib/user";
import { stampUid } from "@/aetheris/core/ravana/http";
import { deleteProject, getProject, updateProject } from "@/aetheris/core/ravana/projects";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { uid, isNew } = await getUserId();
  const p = await getProject(uid, (await params).id);
  if (!p) return stampUid(NextResponse.json({ error: "not found" }, { status: 404 }), isNew, uid);
  return stampUid(NextResponse.json({ project: p }), isNew, uid);
}

export async function PATCH(req: Request, { params }: Ctx) {
  const { uid, isNew } = await getUserId();
  const body = await req.json().catch(() => null);
  const p = await updateProject(uid, (await params).id, {
    name: typeof body?.name === "string" ? body.name : undefined,
    description: typeof body?.description === "string" ? body.description : undefined,
  });
  if (!p) return stampUid(NextResponse.json({ error: "not found" }, { status: 404 }), isNew, uid);
  return stampUid(NextResponse.json({ project: p }), isNew, uid);
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { uid, isNew } = await getUserId();
  const ok = await deleteProject(uid, (await params).id);
  if (!ok) return stampUid(NextResponse.json({ error: "not found" }, { status: 404 }), isNew, uid);
  return stampUid(NextResponse.json({ deleted: true }), isNew, uid);
}
