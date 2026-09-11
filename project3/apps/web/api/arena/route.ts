import { NextResponse } from "next/server";
import { callProvider } from "@/aetheris/lib/router/adapters";
import { allProviders, apiKeyFor, isConfigured, resolveModel } from "@/aetheris/lib/router/providers";
import type { ChatMessage } from "@/aetheris/lib/router/types";
import { getUserId, uidCookie } from "@/aetheris/lib/user";
import { consumeChat } from "@/aetheris/lib/billing/entitlements";

export const runtime = "nodejs";
export const maxDuration = 300; // streaming responses need the long ceiling (Pro plan; Hobby clamps to 60s)
export const dynamic = "force-dynamic";

const SYSTEM = process.env.AETHERIS_SYSTEM_PROMPT ?? "You are Aetheris One, a helpful, concise AI assistant. Format answers in Markdown when useful.";

/**
 * Model Arena: send the same conversation to 2–4 providers at once and stream all answers
 * back on one SSE connection, tagged by lane index. Costs one credit per lane.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({})) as { messages?: ChatMessage[]; providers?: string[] };
  const msgs = (body.messages ?? []).filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string").slice(-30);
  if (!msgs.length) return NextResponse.json({ error: "messages required" }, { status: 400 });
  const hasImages = msgs.some((m) => m.images?.length);
  let ids = Array.from(new Set((body.providers ?? []).filter((x) => typeof x === "string"))).slice(0, 4);
  const configured = allProviders().filter((p) => isConfigured(p) && (!hasImages || p.vision));
  if (ids.length < 2) ids = configured.sort((a, b) => a.priority - b.priority).slice(0, 3).map((p) => p.id);
  const lanes = ids.map((id) => configured.find((p) => p.id === id)).filter((p): p is NonNullable<typeof p> => !!p);
  if (lanes.length < 2) return NextResponse.json({ error: "Arena needs at least two configured providers." }, { status: 400 });

  const { uid, isNew } = await getUserId();
  const quota = await consumeChat(uid, lanes.length, "arena");
  if (!quota.allowed) return NextResponse.json({ error: `Free tier limit reached (${quota.limit}/day).`, code: "quota" }, { status: 402 });

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: unknown) => controller.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`));
      send({ type: "lanes", lanes: lanes.map((p, i) => ({ i, provider: p.id, name: p.name, model: resolveModel(p, { vision: hasImages }) })) });
      await Promise.all(lanes.map(async (p, i) => {
        const started = Date.now();
        try {
          await callProvider({
            provider: p, model: resolveModel(p, { vision: hasImages }), apiKey: apiKeyFor(p), signal: req.signal,
            messages: [{ role: "system", content: SYSTEM }, ...msgs],
            onDelta: (t) => send({ type: "delta", i, text: t }),
          });
          send({ type: "done", i, latencyMs: Date.now() - started });
        } catch (e) {
          send({ type: "error", i, error: (e as Error).message });
        }
      }));
      send({ type: "end", quota });
      controller.close();
    },
  });
  const res = new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" } });
  if (isNew) { const c = uidCookie(uid); res.headers.append("Set-Cookie", `${c.name}=${c.value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${c.maxAge}`); }
  return res;
}
