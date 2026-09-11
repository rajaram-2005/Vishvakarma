import { NextResponse } from "next/server";
import { getUserId } from "@/aetheris/lib/user";
import { consumeChat, planFor } from "@/aetheris/lib/billing/entitlements";
import { resolveTier } from "@/aetheris/lib/models/tiers";
import { getWorkflow, runWorkflow } from "@/aetheris/lib/workflows/engine";

export const runtime = "nodejs";
export const maxDuration = 300; // streaming responses need the long ceiling (Pro plan; Hobby clamps to 60s)
export const dynamic = "force-dynamic";

/** POST { input } → SSE of WfEvent. Costs 1 credit per agent step (irrelevant when free-for-all). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const { uid } = await getUserId();
  const wf = await getWorkflow(id);
  if (!wf || (!wf.public && wf.uid !== uid)) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { input, model } = (await req.json().catch(() => ({}))) as { input?: string; model?: string };
  if (!input?.trim()) return NextResponse.json({ error: "input required" }, { status: 400 });
  const plan = await planFor(uid); const { tier } = resolveTier(model, plan.id);
  const agentSteps = wf.steps.filter((s) => s.kind === "agent").length;
  const quota = await consumeChat(uid, Math.max(1, agentSteps), "agents");
  if (!quota.allowed) return NextResponse.json({ error: `Daily limit reached (${quota.limit}).`, code: "quota" }, { status: 402 });
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(ctrl) {
      const send = (e: unknown) => { try { ctrl.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`)); } catch { /* closed */ } };
      await runWorkflow(wf, uid, input.slice(0, 40_000), { onEvent: send, signal: req.signal, allow: tier.providers, allowKeyless: tier.allowKeyless, maxTokens: tier.maxTokens });
      ctrl.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" } });
}
