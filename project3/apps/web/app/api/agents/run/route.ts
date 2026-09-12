import { voicePrompt } from "@/aetheris/lib/voice";
import { NextResponse } from "next/server";
import { orchestrate } from "@/aetheris/lib/agents/orchestrator";
import { addLessons, getLessons } from "@/aetheris/lib/agents/lessons";
import type { ChatMessage } from "@/aetheris/lib/router/types";
import { getUserId, uidCookie } from "@/aetheris/lib/user";
import { consumeChat, planFor } from "@/aetheris/lib/billing/entitlements";
import { resolveTier } from "@/aetheris/lib/models/tiers";
import { type EnabledServer } from "@/aetheris/lib/mcp/agent";
import { getSession } from "@/aetheris/lib/github/auth";
import { readTokens } from "@/aetheris/lib/mcp/oauth";
import { searchKeyFor } from "@/aetheris/lib/search/tavily";

export const runtime = "nodejs";
export const maxDuration = 300; // streaming responses need the long ceiling (Pro plan; Hobby clamps to 60s)
export const dynamic = "force-dynamic";

const SYSTEM_PROMPT = process.env.AETHERIS_SYSTEM_PROMPT ?? "You are Aetheris One, a helpful, concise AI assistant. Format answers in Markdown when useful.";
const ARTIFACT_PROMPT = `When you produce substantial standalone content — a complete program or file (>15 lines), an HTML page, an SVG, a React component, a Mermaid diagram, or a long document — wrap it in a fenced code block whose info string includes a title, e.g. \`\`\`html title="Landing page". Keep short snippets inline as normal code blocks without a title.`;

type InMsg = { role: string; content: string; images?: string[] };

export async function POST(req: Request) {
  const body = await req.json().catch(() => null) as null | {
    messages?: InMsg[]; agents?: string[]; preferred?: string; model?: string; servers?: EnabledServer[]; searchKey?: string;
    project?: { instructions?: string; files?: { name?: string; text?: string }[] } | null; memory?: string[]; fabric?: boolean; voice?: string;
  };
  const raw = (body?.messages ?? []).filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string").slice(-30);
  if (raw.length === 0 || raw[raw.length - 1].role !== "user") return NextResponse.json({ error: "messages must end with a user message" }, { status: 400 });

  const { uid, isNew } = await getUserId();
  const plan = await planFor(uid);
  const { tier } = resolveTier(body?.model, plan.id);
  const wantsMulti = (body?.agents?.length ?? 0) > 1 || /^@[\w-]+\s+@/.test(raw[raw.length - 1].content);
  if (!plan.features.includes("agents") && wantsMulti) {
    return NextResponse.json({ error: "Multi-agent pipelines need Lite or above. Free includes single-agent @mentions.", code: "upgrade", feature: "agents" }, { status: 402 });
  }
  const quota = await consumeChat(uid, 2, "agents"); // orchestration = 2 credits
  if (!quota.allowed) return NextResponse.json({ error: `Free tier limit reached (${quota.limit}/day). Upgrade for unlimited agents.`, code: "quota", quota }, { status: 402 });

  const sysParts = [SYSTEM_PROMPT, ARTIFACT_PROMPT];
  const proj = body?.project;
  if (proj?.instructions?.trim()) sysParts.push(`PROJECT INSTRUCTIONS:\n${proj.instructions.trim().slice(0, 6000)}`);
  if (Array.isArray(proj?.files) && proj!.files.length) {
    let budget = 30_000; const docs: string[] = [];
    for (const f of proj!.files) { if (typeof f?.text !== "string") continue; const t = f.text.slice(0, Math.max(0, budget)); budget -= t.length; docs.push(`--- FILE: ${f.name ?? "file"} ---\n${t}`); if (budget <= 0) break; }
    if (docs.length) sysParts.push(`PROJECT KNOWLEDGE:\n${docs.join("\n\n")}`);
  }
  if (Array.isArray(body?.memory) && body!.memory.length) sysParts.push(`MEMORY about this user:\n${body!.memory.slice(0, 60).map((m) => `- ${m}`).join("\n")}`);
  if (typeof body?.voice === "string" && /^[a-z]{2}(-[A-Za-z]{2})?$/.test(body.voice)) sysParts.push(voicePrompt(body.voice));

  // Joined with the Intelligence-OS core: typed memory + knowledge fabric (+ document KBs) ground agent runs too. Best-effort.
  const lastUserText = [...raw].reverse().find((m) => m.role === "user")?.content;
  if (lastUserText && body?.fabric !== false) {
    try {
      const [{ recall, memoryBlock }, { queryUnified, knowledgeBlock }] = await Promise.all([import("@/aetheris/core/memory/memory"), import("@/aetheris/core/knowledge/fabric")]);
      const [mem, facts] = await Promise.all([recall(uid, lastUserText, { k: 6 }), queryUnified(uid, lastUserText, { k: 5 })]);
      const mb = memoryBlock(mem); if (mb) sysParts.push(mb);
      const kbk = knowledgeBlock(facts.filter((h) => !h.fact.tags.some((t) => t.startsWith("memory:")))); if (kbk) sysParts.push(kbk);
    } catch { /* fabric unavailable — run continues */ }
  }
  const messages: ChatMessage[] = [
    { role: "system", content: sysParts.join("\n\n") },
    ...raw.map((m, i) => ({ role: m.role as "user" | "assistant", content: m.content, ...(i === raw.length - 1 && Array.isArray(m.images) && m.images.length ? { images: m.images.slice(0, 4) } : {}) })),
  ];

  const gh = await getSession().catch(() => null);
  const tokenMap = await readTokens().catch(() => ({} as Record<string, { access_token: string }>));
  const oauthTokens: Record<string, string> = {};
  for (const [id, t] of Object.entries(tokenMap)) oauthTokens[id] = t.access_token;
  const lessons = await getLessons(uid);

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: unknown) => { try { controller.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`)); } catch { /* closed */ } };
      try {
        await orchestrate({
          messages, preferred: body?.preferred, agents: body?.agents, servers: body?.servers ?? [],
          ctx: { uid, github: gh ? { token: gh.token, login: gh.login } : undefined, oauthTokens },
          searchKey: searchKeyFor(body?.searchKey), lessons, signal: req.signal,
          policy: { maxAgents: Math.min(plan.maxAgents, tier.agents.max), parallel: tier.agents.parallel && plan.features.includes("parallel_agents"), critique: tier.agents.critique, allow: tier.providers, allowKeyless: tier.allowKeyless, maxTokens: tier.maxTokens, priority: plan.features.includes("priority_routing") },
          onEvent: async (e) => {
            send(e);
            if (e.type === "lessons") {
              await addLessons(uid, e.lessons).catch(() => undefined);
              // mirror Metis lessons into typed procedural memory (provenance: agent)
              import("@/aetheris/core/memory/memory").then(({ remember }) => Promise.all(e.lessons.map((l) => remember(uid, "procedural", l.text, { tags: ["metis", `agent:${l.agent}`], confidence: 0.7, source: "agent" })))).catch(() => undefined);
            }
          },
        });
      } catch (e) {
        send({ type: "error", error: (e as Error).message });
      } finally { controller.close(); }
    },
  });
  const res = new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" } });
  if (isNew) { const c = uidCookie(uid); res.headers.append("Set-Cookie", `${c.name}=${c.value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${c.maxAge}`); }
  return res;
}
