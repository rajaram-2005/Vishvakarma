import { getUserId } from "@/aetheris/lib/user";
import { stampUid } from "@/aetheris/core/ravana/http";
import { getTask, toPublic } from "@/aetheris/core/ravana/engine";
import { attach, subscribe } from "@/aetheris/core/ravana/events";
export const runtime = "nodejs";
export const maxDuration = 300; // streaming responses need the long ceiling (Pro plan; Hobby clamps to 60s)
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/v1/ravana/tasks/{task_id}/stream — SSE execution trace.
 *
 * First frame: {"type":"snapshot","task":{…}} with the persisted events; then live events while
 * the run is active; a final "task.completed/failed/cancelled" frame ends the stream. This is an
 * execution trace — RAVANA's private reasoning is never streamed.
 */
export async function GET(req: Request, { params }: Ctx) {
  const { uid, isNew } = await getUserId();
  const id = (await params).id;
  const task = await getTask(id);
  if (!task || task.uid !== uid) {
    return new Response(`data: ${JSON.stringify({ type: "error", error: "not found" })}\n\n`, { status: 404, headers: { "Content-Type": "text/event-stream; charset=utf-8" } });
  }
  const enc = new TextEncoder();
  attach(id);
  const stream = new ReadableStream<Uint8Array>({
    start(ctrl) {
      let closed = false;
      const send = (e: unknown) => {
        if (closed) return;
        try {
          ctrl.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`));
        } catch {
          closed = true;
        }
      };
      const off = subscribe(id, (ev, t) => {
        send({ type: "event", event: ev, task: toPublic(t) });
        if (["task.completed", "task.failed", "task.cancelled"].includes(ev.type)) {
          off?.();
          try {
            ctrl.close();
          } catch {
            /* closed */
          }
        }
      });
      const snapshot = toPublic(task);
      send({ type: "snapshot", task: snapshot, live: !!off });
      if (!off) {
        // not live: replay the persisted trace then finish
        for (const ev of task.events) send({ type: "event", event: ev, task: snapshot });
        send({ type: "done", task: snapshot });
        try {
          ctrl.close();
        } catch {
          /* closed */
        }
      }
      req.signal.addEventListener("abort", () => off?.());
    },
  });
  return stampUid(
    new Response(stream, {
      headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" },
    }),
    isNew,
    uid,
  );
}
