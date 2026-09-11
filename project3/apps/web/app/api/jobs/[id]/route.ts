import { NextResponse } from "next/server";
import { getUserId } from "@/aetheris/lib/user";
import { cancelJob, getJob, isLive, retryJob, subscribe } from "@/aetheris/core/agents/runtime";
export const runtime = "nodejs";
export const maxDuration = 300; // streaming responses need the long ceiling (Pro plan; Hobby clamps to 60s) export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** GET → job (add ?stream=1 for SSE of live events while running). DELETE → cancel. POST → retry. */
export async function GET(req: Request, { params }: Ctx) {
  const { uid } = await getUserId(); const { id } = await params; const job = await getJob(id);
  if (!job || job.uid !== uid) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!new URL(req.url).searchParams.get("stream") || !isLive(id)) return NextResponse.json({ job });
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    start(ctrl) {
      const send = (e: unknown) => { try { ctrl.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`)); } catch { /* closed */ } };
      send({ type: "job", job });
      const off = subscribe(id, (e) => { send(e); if (e.type === "job" && !["queued", "running"].includes(e.job.status)) { off?.(); ctrl.close(); } });
      if (!off) ctrl.close();
      req.signal.addEventListener("abort", () => off?.());
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" } });
}
export async function DELETE(_r: Request, { params }: Ctx) { const { uid } = await getUserId(); const j = await cancelJob(uid, (await params).id); return j ? NextResponse.json({ job: j }) : NextResponse.json({ error: "not found" }, { status: 404 }); }
export async function POST(_r: Request, { params }: Ctx) { const { uid } = await getUserId(); const j = await retryJob(uid, (await params).id); return j ? NextResponse.json({ job: j }, { status: 202 }) : NextResponse.json({ error: "not found" }, { status: 404 }); }
