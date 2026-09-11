import { record } from "@/aetheris/core/observability/events";
/**
 * Orchestrator — Aetheris Prime (ultra) plans; Hermes-based sub-agents execute;
 * Prime synthesises; Metis reflects and stores lessons (meta-learning loop).
 */
import { conceptGlossary } from "@/aetheris/lib/concepts";
import { route } from "@/aetheris/lib/router/router";
import { runAgent, type EnabledServer, type AgentContext } from "@/aetheris/lib/mcp/agent";
import { groundingBlock, searchWeb } from "@/aetheris/lib/search/tavily";
import type { ChatMessage } from "@/aetheris/lib/router/types";
import { AGENTS, HERMES_BASE, METIS_BASE, agentById, catalogForPlanner, parseMentions } from "./catalog";
import { lessonsBlock } from "./lessons";
import type { AgentEvent, AgentPlan, AgentSpec, Lesson } from "./types";

export interface OrchestrateOptions {
  messages: ChatMessage[];            // history incl. server system prompt as messages[0]
  preferred?: string;
  /** Force specific agents (from @mentions or the picker). */
  agents?: string[];
  servers?: EnabledServer[];
  ctx?: AgentContext;
  searchKey?: string;
  lessons?: Lesson[];
  signal?: AbortSignal;
  onEvent: (e: AgentEvent) => void;
  /** Plan/tier policy. */
  policy?: { maxAgents: number; parallel: boolean; critique: boolean; allow?: string[]; allowKeyless?: boolean; maxTokens?: number; priority?: boolean };
}

const PRIME = agentById("prime")!;
const pol = (o: OrchestrateOptions) => ({ allow: o.policy?.allow, allowKeyless: o.policy?.allowKeyless, priority: o.policy?.priority });
const HERMES = agentById("hermes")!;

function extractJson<T>(s: string): T | null {
  const m = /\{[\s\S]*\}/.exec(s);
  if (!m) return null;
  try { return JSON.parse(m[0]) as T; } catch { return null; }
}

function historyText(msgs: ChatMessage[], max = 6000): string {
  const rest = msgs.filter((m) => m.role !== "system").slice(-8);
  let s = rest.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join("\n\n");
  if (s.length > max) s = "…" + s.slice(-max);
  return s;
}

/** 1. Prime plans which specialists to use. */
async function plan(opts: OrchestrateOptions, task: string, forced: AgentSpec[]): Promise<{ plan: AgentPlan; provider?: string }> {
  if (forced.length === 1) {
    return { plan: { agents: [forced[0].id], mode: "single", reason: `You asked for @${forced[0].id}.`, briefs: [task] } };
  }
  if (forced.length > 1) {
    return { plan: { agents: forced.map((a) => a.id), mode: "pipeline", reason: `You asked for ${forced.map((a) => "@" + a.id).join(" → ")}.`, briefs: forced.map(() => task) } };
  }
  const cap = opts.policy?.maxAgents ?? 3;
  const r = await route({
    ...pol(opts), preferred: opts.preferred, temperature: 0.1, signal: opts.signal, maxTokens: 600,
    messages: [
      { role: "system", content: `${PRIME.system}\n\nAvailable specialists:\n${catalogForPlanner()}\n\nReply ONLY with JSON: {"agents":["id",...],"mode":"single|pipeline|parallel","reason":"<=100 chars","briefs":["task for agent 1",...]}.\nRules: prefer ONE agent for simple requests (most requests). Never exceed ${cap} agent(s). Use 2–3 agents only when the task clearly spans domains (e.g. code + review, research + write). "pipeline" = each agent builds on the previous output; "parallel" = independent perspectives merged. Use "hermes" for anything general or conversational.` },
      { role: "user", content: `Conversation so far:\n${historyText(opts.messages)}\n\nCurrent request: ${task}` },
    ],
  });
  const p = extractJson<AgentPlan>(r.content);
  const ids = (p?.agents ?? []).map((x) => agentById(String(x))?.id).filter((x): x is string => !!x && x !== "prime").slice(0, cap);
  if (ids.length === 0) return { plan: { agents: [HERMES.id], mode: "single", reason: "General request.", briefs: [task] }, provider: r.provider };
  const briefs = Array.isArray(p?.briefs) && p!.briefs.length === ids.length ? p!.briefs.map(String) : ids.map(() => task);
  const mode: AgentPlan["mode"] = ids.length === 1 ? "single" : p?.mode === "parallel" && opts.policy?.parallel !== false ? "parallel" : "pipeline";
  return { plan: { agents: ids, mode, reason: String(p?.reason ?? "").slice(0, 120), briefs }, provider: r.provider };
}

/** 2. Run one specialist (with tools/web when it is entitled and they are available). */
async function runSpecialist(
  opts: OrchestrateOptions, agent: AgentSpec, brief: string, index: number, priorOutput: string | undefined, baseSystem: string,
): Promise<{ text: string; provider: string; model: string }> {
  const started = Date.now();
  opts.onEvent({ type: "agent_start", agent: agent.id, brief, index });
  const sysParts = [baseSystem, HERMES_BASE, `ROLE: ${agent.name} (${agent.id})\n${agent.system}`];
  // Ethics/explainability agents are grounded in the Explained-AI knowledge base so their vocabulary matches the docs.
  if (agent.domain === "ethics") sysParts.push(`Reference glossary — when you use one of these concepts, link it as [term](/docs/concept-<id>):\n${conceptGlossary()}`);
  const lb = lessonsBlock(opts.lessons ?? [], agent.id);
  if (lb) sysParts.push(lb);

  // Web grounding for web-entitled agents
  if (agent.tools?.includes("web") && opts.searchKey) {
    try {
      const r = await searchWeb(brief, opts.searchKey, { maxResults: 6, signal: opts.signal });
      if (r.results.length) sysParts.push(groundingBlock(r));
    } catch { /* ignore */ }
  }

  const history = opts.messages.filter((m) => m.role !== "system");
  const last = history[history.length - 1];
  const userContent = priorOutput
    ? `${brief}\n\n--- OUTPUT FROM PREVIOUS SPECIALIST (build on it, do not repeat it verbatim) ---\n${priorOutput.slice(0, 12000)}`
    : brief;
  const msgs: ChatMessage[] = [
    { role: "system", content: sysParts.join("\n\n") },
    ...history.slice(0, -1),
    { role: "user", content: userContent, ...(last?.images ? { images: last.images } : {}) },
  ];

  const useTools = agent.tools?.includes("mcp") && (opts.servers?.length ?? 0) > 0;
  let text = "", provider = "", model = "";
  if (useTools) {
    const a = await runAgent({ messages: msgs, servers: opts.servers!, preferred: opts.preferred, ctx: opts.ctx, onEvent: (e) => opts.onEvent({ type: "tool", agent: agent.id, event: e }) });
    text = a.content; provider = a.provider; model = a.model;
    opts.onEvent({ type: "agent_delta", agent: agent.id, text });
  } else {
    const r = await route({
      ...pol(opts), maxTokens: opts.policy?.maxTokens, messages: msgs, preferred: opts.preferred, temperature: agent.temperature ?? 0.4, signal: opts.signal,
      onDelta: (t) => opts.onEvent({ type: "agent_delta", agent: agent.id, text: t }),
    });
    text = r.content; provider = r.provider; model = r.model;
  }
  opts.onEvent({ type: "agent_done", agent: agent.id, provider, model, latencyMs: Date.now() - started, chars: text.length });
  record({ type: "agent", uid: opts.ctx?.uid, capability: `agent:${agent.id}`, ok: true, ms: Date.now() - started, meta: { provider, chars: text.length } });
  return { text, provider, model };
}

/** 4. Metis reflects → lessons. Cheap, best-effort. */
async function reflect(opts: OrchestrateOptions, task: string, planned: AgentPlan, answer: string): Promise<Lesson[]> {
  try {
    const r = await route({
      ...pol(opts), preferred: opts.preferred, temperature: 0.1, signal: opts.signal, maxTokens: 300,
      messages: [
        { role: "system", content: `${METIS_BASE}\nReply ONLY with JSON: {"lessons":[{"agent":"<agent id or *>","text":"..."}]} — 0 to 2 lessons. Return an empty list when nothing generalisable was learned (this is the common case).` },
        { role: "user", content: `Request: ${task.slice(0, 1500)}\n\nRouting: ${planned.agents.join(" → ")} (${planned.mode}) — ${planned.reason}\n\nAnswer (truncated): ${answer.slice(0, 2500)}\n\nExisting lessons: ${(opts.lessons ?? []).slice(-10).map((l) => l.text).join(" | ") || "none"}` },
      ],
    });
    const j = extractJson<{ lessons?: { agent?: string; text?: string }[] }>(r.content);
    const now = Date.now();
    return (j?.lessons ?? []).filter((l) => typeof l.text === "string" && l.text.trim().length > 8).slice(0, 2)
      .map((l) => ({ agent: agentById(String(l.agent ?? "*"))?.id ?? "*", text: String(l.text).trim(), at: now }));
  } catch { return []; }
}

export async function orchestrate(opts: OrchestrateOptions): Promise<void> {
  const started = Date.now();
  const emit = opts.onEvent;
  const baseSystem = opts.messages.find((m) => m.role === "system")?.content ?? "";
  const lastUser = [...opts.messages].reverse().find((m) => m.role === "user");
  const rawTask = lastUser?.content ?? "";
  const mention = parseMentions(rawTask);
  const forced = (opts.agents ?? []).map((id) => agentById(id)).filter((a): a is AgentSpec => !!a).slice(0, opts.policy?.maxAgents ?? 3);
  const chosen = (forced.length ? forced : mention.agents).slice(0, opts.policy?.maxAgents ?? 3);
  const task = mention.agents.length ? mention.text : rawTask;

  // 1. Plan
  const { plan: p, provider: planProvider } = await plan(opts, task, chosen);
  emit({ type: "plan", plan: p, provider: planProvider });

  // 2. Execute
  const outputs: { agent: AgentSpec; text: string; provider: string; model: string }[] = [];
  const specs = p.agents.map((id) => agentById(id)!).filter(Boolean);
  if (p.mode === "parallel" && specs.length > 1) {
    const results = await Promise.allSettled(specs.map((a, i) => runSpecialist(opts, a, p.briefs[i] ?? task, i, undefined, baseSystem)));
    results.forEach((r, i) => {
      if (r.status === "fulfilled") outputs.push({ agent: specs[i], ...r.value });
      else { emit({ type: "agent_error", agent: specs[i].id, error: (r.reason as Error).message }); record({ type: "agent", uid: opts.ctx?.uid, capability: `agent:${specs[i].id}`, ok: false, detail: (r.reason as Error).message }); }
    });
  } else {
    let prior: string | undefined;
    for (let i = 0; i < specs.length; i++) {
      try {
        const r = await runSpecialist(opts, specs[i], p.briefs[i] ?? task, i, prior, baseSystem);
        outputs.push({ agent: specs[i], ...r });
        prior = r.text;
      } catch (e) {
        emit({ type: "agent_error", agent: specs[i].id, error: (e as Error).message }); record({ type: "agent", uid: opts.ctx?.uid, capability: `agent:${specs[i].id}`, ok: false, detail: (e as Error).message });
        if (i === 0) throw e; // nothing to build on
      }
    }
  }
  if (outputs.length === 0) throw new Error("All specialists failed.");

  // 3. Synthesise (only when more than one output; a single specialist's answer IS the answer)
  let final = outputs[outputs.length - 1].text;
  let provider = outputs[outputs.length - 1].provider;
  let model = outputs[outputs.length - 1].model;
  if (outputs.length > 1 && p.mode === "parallel") {
    emit({ type: "synthesis" });
    let acc = "";
    const r = await route({
      ...pol(opts), maxTokens: opts.policy?.maxTokens, preferred: opts.preferred, temperature: 0.3, signal: opts.signal,
      messages: [
        { role: "system", content: `${baseSystem}\n\n${HERMES_BASE}\n\n${PRIME.system}` },
        { role: "user", content: `Request: ${task}\n\nSpecialist outputs:\n\n${outputs.map((o) => `### ${o.agent.name}\n${o.text}`).join("\n\n")}\n\nMerge into one final answer for the user. Keep artifacts (titled fenced blocks) intact.` },
      ],
      onDelta: (t) => { acc += t; emit({ type: "delta", text: t }); },
    });
    final = r.content || acc; provider = r.provider; model = r.model;
  } else if (opts.policy?.critique) {
    // God tier: Metis critiques and Prime revises before the answer is shown.
    emit({ type: "synthesis" });
    let acc = "";
    const r = await route({
      ...pol(opts), maxTokens: opts.policy?.maxTokens, preferred: opts.preferred, temperature: 0.2, signal: opts.signal,
      messages: [
        { role: "system", content: `${baseSystem}\n\n${HERMES_BASE}\n\n${METIS_BASE}\nYou are running the God-mode quality pass. Silently critique the draft (errors, gaps, unclear structure, missing edge cases), then output ONLY the improved final answer — no preamble, no critique text. Preserve titled fenced artifacts.` },
        { role: "user", content: `Request: ${task}\n\nDraft answer:\n${final.slice(0, 16000)}` },
      ],
      onDelta: (t) => { acc += t; emit({ type: "delta", text: t }); },
    });
    if ((r.content || acc).trim().length > final.length * 0.4) { final = r.content || acc; provider = r.provider; model = r.model; }
    else { emit({ type: "synthesis" }); emit({ type: "delta", text: final }); }
  } else {
    // stream the chosen output as the final text (it was already streamed per-agent; UI uses agent_delta for live view)
    emit({ type: "delta", text: final });
  }

  emit({ type: "done", agents: p.agents, provider, model, latencyMs: Date.now() - started, mode: p.mode });

  // 4. Meta-learning (after done so the UI is not blocked)
  const lessons = await reflect(opts, task, p, final);
  if (lessons.length) emit({ type: "lessons", lessons });
}

export { AGENTS };
