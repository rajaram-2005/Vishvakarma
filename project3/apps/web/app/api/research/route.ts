import { NextResponse } from "next/server";
import { deepResearch } from "@/aetheris/lib/research/deep";
import { searchKeyFor } from "@/aetheris/lib/search/tavily";
import { getUserId, uidCookie } from "@/aetheris/lib/user";
import { consumeChat, hasFeature } from "@/aetheris/lib/billing/entitlements";

export const runtime = "nodejs";
export const maxDuration = 300; // streaming responses need the long ceiling (Pro plan; Hobby clamps to 60s)
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({})) as { topic?: string; searchKey?: string; preferred?: string; breadth?: number };
  const topic = (body.topic ?? "").trim();
  if (!topic) return NextResponse.json({ error: "topic required" }, { status: 400 });
  const key = searchKeyFor(body.searchKey);
  if (!key) return NextResponse.json({ error: "Deep Research needs a Tavily key. Add one in Settings (free at tavily.com).", code: "search_key" }, { status: 400 });

  const { uid, isNew } = await getUserId();
  if (!(await hasFeature(uid, "deep_research"))) return NextResponse.json({ error: "Deep Research is included in Pro and above.", code: "upgrade", feature: "deep_research" }, { status: 402 });
  const quota = await consumeChat(uid, 5, "research"); // research is expensive: counts as 5 messages
  if (!quota.allowed) return NextResponse.json({ error: `Free tier limit reached (${quota.limit}/day). Upgrade for unlimited Deep Research.`, code: "quota" }, { status: 402 });

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: unknown) => controller.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`));
      try {
        await deepResearch({ topic, searchKey: key, preferred: body.preferred, breadth: body.breadth, signal: req.signal, onEvent: send });
      } catch (e) {
        send({ type: "error", error: (e as Error).message });
      } finally {
        controller.close();
      }
    },
  });
  const res = new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" } });
  if (isNew) res.headers.append("Set-Cookie", `${uidCookie(uid).name}=${uid}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000`);
  return res;
}
