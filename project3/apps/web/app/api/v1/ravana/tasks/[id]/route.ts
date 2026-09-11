import { NextResponse } from "next/server";
import { getUserId } from "@/aetheris/lib/user";
import { stampUid } from "@/aetheris/core/ravana/http";
import { cancelTask, getTask, toPublic } from "@/aetheris/core/ravana/engine";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** GET /api/v1/ravana/tasks/{task_id} — full task snapshot: status, plan, events, result. */
export async function GET(_req: Request, { params }: Ctx) {
  const { uid, isNew } = await getUserId();
  const task = await getTask((await params).id);
  if (!task || task.uid !== uid) return stampUid(NextResponse.json({ error: "not found" }, { status: 404 }), isNew, uid);
  return stampUid(NextResponse.json({ task: toPublic(task) }), isNew, uid);
}

/** DELETE — cancel a queued/running/paused task. */
export async function DELETE(_req: Request, { params }: Ctx) {
  const { uid, isNew } = await getUserId();
  const task = await cancelTask(uid, (await params).id);
  if (!task) return stampUid(NextResponse.json({ error: "not found" }, { status: 404 }), isNew, uid);
  return stampUid(NextResponse.json({ task: toPublic(task) }), isNew, uid);
}
