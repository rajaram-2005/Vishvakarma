import { NextResponse } from "next/server";
import { eventsSince, getRoom, subscribe } from "@/aetheris/lib/rooms/rooms";

export const runtime = "nodejs";
export const maxDuration = 300; // streaming responses need the long ceiling (Pro plan; Hobby clamps to 60s)
export const dynamic = "force-dynamic";

/** GET ?since=N — SSE stream of room events (falls back to JSON list with ?poll=1). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  const since = Number(url.searchParams.get("since") ?? 0);
  if (!(await getRoom(id))) return NextResponse.json({ error: "room not found" }, { status: 404 });
  if (url.searchParams.get("poll")) return NextResponse.json({ events: await eventsSince(id, since) });

  const enc = new TextEncoder();
  let unsub = () => {};
  let ping: ReturnType<typeof setInterval>;
  const stream = new ReadableStream({
    start(ctrl) {
      const send = (o: unknown) => { try { ctrl.enqueue(enc.encode(`data: ${JSON.stringify(o)}\n\n`)); } catch { /* closed */ } };
      unsub = subscribe(id, send, since);
      ping = setInterval(() => { try { ctrl.enqueue(enc.encode(": ping\n\n")); } catch { /* closed */ } }, 20_000);
      req.signal.addEventListener("abort", () => { unsub(); clearInterval(ping); try { ctrl.close(); } catch { /* closed */ } });
    },
    cancel() { unsub(); clearInterval(ping); },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" } });
}
