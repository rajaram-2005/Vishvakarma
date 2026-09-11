import { NextResponse } from "next/server";
import { getUserId } from "@/aetheris/lib/user";
import { stampUid } from "@/aetheris/core/ravana/http";
import { getTask, toPublic } from "@/aetheris/core/ravana/engine";
import { startRun } from "@/aetheris/core/ravana/engine";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** POST /api/v1/ravana/tasks/{task_id}/run — start a queued task (idempotent while running). */
export async function POST(_req: Request, { params }: Ctx) {
  const { uid, isNew } = await getUserId();
  const id = (await params).id;
  const task = await getTask(id);
  if (!task || task.uid !== uid) return stampUid(NextResponse.json({ error: "not found" }, { status: 404 }), isNew, uid);
  if (task.status !== "queued") {
    return stampUid(NextResponse.json({ error: `task is ${task.status}; only queued tasks can be started` }, { status: 409 }), isNew, uid);
  }
  void startRun(id);
  return stampUid(NextResponse.json({ task_id: id, task: toPublic(task) }, { status: 202 }), isNew, uid);
}
