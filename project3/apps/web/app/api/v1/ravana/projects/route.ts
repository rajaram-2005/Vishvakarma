import { NextResponse } from "next/server";
import { getUserId } from "@/aetheris/lib/user";
import { stampUid } from "@/aetheris/core/ravana/http";
import { createProject, listProjects } from "@/aetheris/core/ravana/projects";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/ravana/projects — project list with task counts. */
export async function GET() {
  const { uid, isNew } = await getUserId();
  const projects = await listProjects(uid);
  return stampUid(NextResponse.json({ count: projects.length, projects }), isNew, uid);
}

/** POST — create a project {name, description?}. */
export async function POST(req: Request) {
  const { uid, isNew } = await getUserId();
  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) return stampUid(NextResponse.json({ error: "name is required" }, { status: 400 }), isNew, uid);
  const p = await createProject(uid, { name, description: typeof body?.description === "string" ? body.description : undefined });
  return stampUid(NextResponse.json({ project: p }, { status: 201 }), isNew, uid);
}
