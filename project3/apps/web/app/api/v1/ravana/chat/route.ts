import { NextResponse } from "next/server";
import { getUserId } from "@/aetheris/lib/user";
import { stampUid } from "@/aetheris/core/ravana/http";
import { createTask, toPublic } from "@/aetheris/core/ravana/engine";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/v1/ravana/chat — the chat sugar: send a goal/message, RAVANA classifies it, plans
 * and runs. Responds immediately with the created task (id rvn_…); stream the run over
 * GET /api/v1/ravana/tasks/{id}/stream.
 */
export async function POST(req: Request) {
  const { uid, isNew } = await getUserId();
  const body = await req.json().catch(() => null);
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  if (!message) return stampUid(NextResponse.json({ error: "message is required" }, { status: 400 }), isNew, uid);
  if (message.length > 20_000) return stampUid(NextResponse.json({ error: "message too long (max 20k chars)" }, { status: 400 }), isNew, uid);
  const images = Array.isArray(body?.images)
    ? body.images.filter((i: unknown) => typeof i === "string" && i.startsWith("data:image/") && i.length < 6_000_000).slice(0, 3)
    : undefined;
  const task = await createTask({
    uid,
    objective: message,
    title: typeof body?.title === "string" && body.title.trim() ? body.title : undefined,
    context: typeof body?.context === "string" ? body.context : undefined,
    images,
    projectId: typeof body?.project_id === "string" ? body.project_id : null,
    engine: (body?.engine === "preview" || body?.engine === "mesh" ? body.engine : "auto") as "auto" | "preview" | "mesh",
    priority: body?.priority === "high" || body?.priority === "low" ? body.priority : "normal",
    autoStart: body?.auto_start !== false,
  });
  return stampUid(NextResponse.json({ task_id: task.id, task: toPublic(task) }, { status: 202 }), isNew, uid);
}
