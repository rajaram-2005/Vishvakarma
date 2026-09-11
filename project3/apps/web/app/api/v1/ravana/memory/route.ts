import { NextResponse } from "next/server";
import { getUserId } from "@/aetheris/lib/user";
import { stampUid } from "@/aetheris/core/ravana/http";
import { list, saveMemory } from "@/aetheris/core/ravana/memory/manager";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/ravana/memory — list memories (?type=&project_id=&limit=). */
export async function GET(req: Request) {
  const { uid, isNew } = await getUserId();
  const u = new URL(req.url);
  const type = u.searchParams.get("type");
  const memories = await list(
    uid,
    (type === "episodic" || type === "semantic" ? type : undefined) as never,
    u.searchParams.get("project_id"),
    Math.min(Number(u.searchParams.get("limit") ?? 100), 300),
  );
  return stampUid(NextResponse.json({ count: memories.length, memories }), isNew, uid);
}

/** POST — save a durable memory {type: episodic|semantic, content, project_id?, tags?, importance?}. */
export async function POST(req: Request) {
  const { uid, isNew } = await getUserId();
  const body = await req.json().catch(() => null);
  const type = body?.type;
  const content = typeof body?.content === "string" ? body.content.trim() : "";
  if (type !== "episodic" && type !== "semantic") return stampUid(NextResponse.json({ error: "type must be episodic or semantic" }, { status: 400 }), isNew, uid);
  if (!content) return stampUid(NextResponse.json({ error: "content is required" }, { status: 400 }), isNew, uid);
  const importance = Number(body?.importance);
  const mem = await saveMemory({
    uid,
    type,
    content,
    projectId: typeof body?.project_id === "string" ? body.project_id : null,
    tags: Array.isArray(body?.tags) ? body.tags.map(String).slice(0, 10) : undefined,
    importance: Number.isFinite(importance) ? Math.max(0, Math.min(1, importance)) : undefined,
    source: "api",
  });
  if (!mem) return stampUid(NextResponse.json({ error: "content too short" }, { status: 400 }), isNew, uid);
  return stampUid(NextResponse.json({ memory: mem }, { status: 201 }), isNew, uid);
}
