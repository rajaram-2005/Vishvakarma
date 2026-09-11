import { NextResponse } from "next/server";
import { getUserId } from "@/aetheris/lib/user";
import { consumeChat, planFor } from "@/aetheris/lib/billing/entitlements";
import { resolveTier } from "@/aetheris/lib/models/tiers";
import { route } from "@/aetheris/lib/router/router";
import { buildExplainPrompt } from "@/aetheris/lib/explain";

export const runtime = "nodejs";
export const maxDuration = 300; // streaming responses need the long ceiling (Pro plan; Hobby clamps to 60s)
export const dynamic = "force-dynamic";

/**
 * Explainability: ask the AI Explainer to audit an answer that was already given.
 * POST { question, answer, provider?, model?, agents?: string[] } → SSE { type: "delta"|"done"|"error" }
 * The explanation always covers: fact vs inference vs guess, assumptions, calibrated confidence,
 * most-likely errors, how to verify cheaply, and bias risk in the framing.
 */

export async function POST(req: Request) {
  const { uid } = await getUserId();
  const b = (await req.json().catch(() => ({}))) as { question?: string; answer?: string; provider?: string; model?: string; agents?: string[] };
  const question = (b.question ?? "").trim().slice(0, 6000); const answer = (b.answer ?? "").trim().slice(0, 12000);
  if (!answer) return NextResponse.json({ error: "answer required" }, { status: 400 });
  const plan = await planFor(uid); const { tier } = resolveTier(b.model, plan.id);
  const quota = await consumeChat(uid, 1, "chat");
  if (!quota.allowed) return NextResponse.json({ error: "Daily limit reached." }, { status: 402 });
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(ctrl) {
      const send = (e: unknown) => { try { ctrl.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`)); } catch { /* closed */ } };
      try {
        const r = await route({ allow: tier.providers, allowKeyless: tier.allowKeyless, maxTokens: 900, temperature: 0.2, signal: req.signal, messages: buildExplainPrompt(question, answer, b), onDelta: (t) => send({ type: "delta", text: t }) });
        send({ type: "done", provider: r.provider, model: r.model });
      } catch (e) { send({ type: "error", error: (e as Error).message }); }
      ctrl.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" } });
}
