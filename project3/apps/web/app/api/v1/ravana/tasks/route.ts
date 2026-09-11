import { NextResponse } from "next/server";
import { getUserId } from "@/aetheris/lib/user";
import { stampUid } from "@/aetheris/core/ravana/http";
import { createTask, listTasks, toPublic } from "@/aetheris/core/ravana/engine";
import type { RavanaTaskStatus } from "@/aetheris/core/ravana/types";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/ravana/tasks — list tasks (?status=&project_id=&limit=). */
export async function GET(req: Request) {
  const { uid, isNew } = await getUserId();
  const u = new URL(req.url);
  const ALLOWED = new Set<RavanaTaskStatus>(["queued", "planning", "running", "awaiting_confirmation", "completed", "failed", "cancelled", "timeout"]);
  const status = (u.searchParams.get("status") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is RavanaTaskStatus => ALLOWED.has(s as RavanaTaskStatus));
  const tasks = await listTasks(uid, {
    status,
    projectId: u.searchParams.get("project_id"),
    limit: Math.min(Number(u.searchParams.get("limit") ?? 50), 200),
  });
  return stampUid(NextResponse.json({ count: tasks.length, tasks: tasks.map(toPublic) }), isNew, uid);
}

/** POST /api/v1/ravana/tasks — create a task ({objective, context?, images?, project_id?, engine?, auto_start?}). */
export async function POST(req: Request) {
  const { uid, isNew } = await getUserId();
  const body = await req.json().catch(() => null);
  const objective = typeof body?.objective === "string" ? body.objective.trim() : "";
  if (!objective) return stampUid(NextResponse.json({ error: "objective is required" }, { status: 400 }), isNew, uid);
  if (objective.length > 20_000) return stampUid(NextResponse.json({ error: "objective too long (max 20k chars)" }, { status: 400 }), isNew, uid);
  const images = Array.isArray(body?.images)
    ? body.images.filter((i: unknown) => typeof i === "string" && i.startsWith("data:image/") && i.length < 6_000_000).slice(0, 3)
    : undefined;
  const budget = typeof body?.budget === "object" && body.budget !== null ? body.budget : undefined;
  const task = await createTask({
    uid,
    objective,
    title: typeof body?.title === "string" ? body.title : undefined,
    context: typeof body?.context === "string" ? body.context : undefined,
    images,
    projectId: typeof body?.project_id === "string" ? body.project_id : null,
    engine: body?.engine === "preview" || body?.engine === "mesh" ? body.engine : "auto",
    priority: body?.priority === "high" || body?.priority === "low" ? body.priority : "normal",
    kind: ["chat", "analysis", "research", "coding", "math", "vision", "build"].includes(body?.kind) ? body.kind : undefined,
    budget,
    autoStart: body?.auto_start !== false,
  });
  return stampUid(NextResponse.json({ task_id: task.id, task: toPublic(task) }, { status: 202 }), isNew, uid);
}
