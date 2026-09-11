import { NextResponse } from "next/server";
import { getUserId } from "@/aetheris/lib/user";
import { consumeChat, planFor } from "@/aetheris/lib/billing/entitlements";
import { resolveTier } from "@/aetheris/lib/models/tiers";
import { route } from "@/aetheris/lib/router/router";
import { agentById, HERMES_BASE, METIS_BASE } from "@/aetheris/lib/agents/catalog";
import type { ChatMessage } from "@/aetheris/lib/router/types";

export const runtime = "nodejs";
export const maxDuration = 300; // streaming responses need the long ceiling (Pro plan; Hobby clamps to 60s)
export const dynamic = "force-dynamic";

/**
 * Debate mode: two agents argue opposite sides of a motion for N rounds, then Metis adjudicates
 * with a scorecard. Great for decisions, essays and seeing both sides of a question.
 * POST { motion, pro?, con?, rounds? } → SSE { type: "turn"|"delta"|"verdict"|"done"|"error" }
 */
export async function POST(req: Request) {
  const { uid } = await getUserId();
  const b = (await req.json().catch(() => ({}))) as { motion?: string; pro?: string; con?: string; rounds?: number; model?: string };
  const motion = (b.motion ?? "").trim().slice(0, 2000);
  if (!motion) return NextResponse.json({ error: "motion required" }, { status: 400 });
  const rounds = Math.min(4, Math.max(1, Number(b.rounds ?? 2)));
  const pro = agentById(b.pro ?? "strategist") ?? agentById("strategist")!;
  const con = agentById(b.con ?? "decision") ?? agentById("decision")!;
  const plan = await planFor(uid); const { tier } = resolveTier(b.model, plan.id);
  const quota = await consumeChat(uid, rounds * 2 + 1, "agents");
  if (!quota.allowed) return NextResponse.json({ error: "Daily limit reached." }, { status: 402 });
  const pol = { allow: tier.providers, allowKeyless: tier.allowKeyless, maxTokens: Math.min(tier.maxTokens ?? 1200, 1200), signal: req.signal };

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(ctrl) {
      const send = (e: unknown) => { try { ctrl.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`)); } catch { /* closed */ } };
      const transcript: { side: "pro" | "con"; agent: string; text: string }[] = [];
      const speak = async (side: "pro" | "con", round: number) => {
        const spec = side === "pro" ? pro : con;
        const sys = `${HERMES_BASE}\n\n${spec.system}\n\nYou are debating. Motion: "${motion}". You argue ${side === "pro" ? "FOR" : "AGAINST"} the motion. Round ${round} of ${rounds}. ${round === 1 ? "Open with your 3 strongest arguments." : "Rebut the other side's latest points specifically, then add one new argument."} Max 180 words. No pleasantries.`;
        const msgs: ChatMessage[] = [{ role: "system", content: sys }, { role: "user", content: transcript.length ? `Transcript so far:\n${transcript.map((t) => `[${t.side.toUpperCase()} · ${t.agent}] ${t.text}`).join("\n\n")}\n\nYour turn.` : "Begin." }];
        send({ type: "turn", side, agent: spec.id, name: spec.name, icon: spec.icon, round });
        let acc = "";
        const r = await route({ ...pol, messages: msgs, temperature: 0.6, onDelta: (t) => { acc += t; send({ type: "delta", side, round, text: t }); } });
        transcript.push({ side, agent: spec.name, text: r.content || acc });
      };
      try {
        for (let round = 1; round <= rounds; round++) { await speak("pro", round); await speak("con", round); }
        send({ type: "turn", side: "judge", agent: "metis", name: "Metis", icon: "🦉", round: rounds + 1 });
        let acc = "";
        const r = await route({ ...pol, temperature: 0.2, messages: [
          { role: "system", content: `${HERMES_BASE}\n\n${METIS_BASE}\n\nYou are the impartial adjudicator. Score each side 1–10 on evidence, logic, rebuttal and clarity in a Markdown table, name the winner with a one-paragraph reason, list the 3 strongest points overall, and give the reader a balanced bottom line for the motion.` },
          { role: "user", content: `Motion: ${motion}\n\nTranscript:\n${transcript.map((t) => `[${t.side.toUpperCase()} · ${t.agent}] ${t.text}`).join("\n\n")}` },
        ], onDelta: (t) => { acc += t; send({ type: "delta", side: "judge", text: t }); } });
        send({ type: "verdict", text: r.content || acc, provider: r.provider });
        send({ type: "done", rounds, pro: pro.id, con: con.id });
      } catch (e) { send({ type: "error", error: (e as Error).message }); }
      ctrl.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" } });
}
