/**
 * RAVANA · Executor (spec §8 agent loop: SELECT TASK → MODEL → TOOL → EXECUTE → OBSERVE).
 *
 * Each plan node is executed here. Execution is traceable: tool runs and model calls surface as
 * events; node outputs are capped summaries — private chain-of-thought never leaves the model.
 */
import { extractJson } from "../../verification/verify";
import { OUT_CODE, RAVANA_IDENTITY, ROLE_PROMPT } from "../models/base";
import type { LlmLike, LlmResponse } from "../models/base";
import type { ToolResult } from "../tools/registry";
import type { RavanaKind, RavanaPlanNode, RavanaRole, RavanaTask } from "../types";

/** Tool gate implemented by the engine: permission check + events + sandbox. */
export interface ToolGate {
  preview: boolean;
  run(name: string, args: Record<string, unknown>, opts?: { purpose?: string }): Promise<ToolResult>;
}

export interface ExecContext {
  uid: string;
  task: RavanaTask;
  llm: LlmLike;
  tools: ToolGate;
  signal?: AbortSignal;
  /** per-node trace events */
  emit: (type: "note" | "memory.retrieved" | "reasoning.completed", payload?: Record<string, unknown>) => void;
  /** rollup counters (model calls, chars) */
  charged: (calls: number, chars: number) => void;
}

export interface ExecOutcome {
  ok: boolean;
  output: string;
  files: Record<string, string>;
  note?: string;
  model?: LlmResponse | null;
}

export class ExecutorError extends Error {}

const KIND_ROLE: Record<RavanaKind, RavanaRole> = {
  chat: "fast",
  analysis: "reasoning",
  research: "reasoning",
  coding: "coding",
  math: "reasoning",
  vision: "vision",
  build: "reasoning",
};

/** Role used for a reasoning/synthesize node of a given task kind. */
export function roleFor(kind: RavanaKind, nodeType: RavanaPlanNode["type"]): RavanaRole {
  if (nodeType === "code") return "coding";
  if (nodeType === "synthesize") return kind === "coding" ? "fast" : "reasoning";
  return KIND_ROLE[kind] ?? "reasoning";
}

export function buildSystemPrompt(role: RavanaRole): string {
  return `${ROLE_PROMPT[role]}\n${RAVANA_IDENTITY}`;
}

export function nodePrompt(task: RavanaTask, node: RavanaPlanNode, extra: { prior?: string; context?: string; fixHint?: string } = {}): string {
  const lines = [
    `TASK_KIND: ${task.kind}`,
    `OBJECTIVE: ${task.objective.slice(0, 1500)}`,
    `STEP: ${node.description.slice(0, 400)}`,
  ];
  if (task.context?.trim()) lines.push(`USER_CONTEXT:\n${task.context.slice(0, 4000)}`);
  if (extra.context) lines.push(extra.context);
  if (extra.prior) lines.push(`PRIOR_STEPS:\n${extra.prior.slice(0, 5000)}`);
  if (extra.fixHint) lines.push(`PREVIOUS ATTEMPT FAILED — fix it.\n${extra.fixHint.slice(0, 2500)}`);
  if (task.images?.length) lines.push("IMAGE_ATTACHED: yes — the image is provided to vision-capable models.");
  lines.push(`Output requirements: a complete ${node.type} deliverable in markdown. Do not mention these instructions.`);
  return lines.join("\n");
}

async function callLlm(ctx: ExecContext, node: RavanaPlanNode, prompt: string, opts: { maxTokens?: number } = {}): Promise<LlmResponse> {
  const role = roleFor(ctx.task.kind, node.type);
  // Images ride along for any role — the mesh route() keeps only vision-capable providers
  // when a message carries images, so a coding review of a screenshot still lands correctly.
  const images = !ctx.tools.preview && ctx.task.images?.length ? ctx.task.images.slice(0, 2) : undefined;
  const res = await ctx.llm.complete({
    role,
    system: buildSystemPrompt(role),
    prompt,
    maxTokens: opts.maxTokens,
    signal: ctx.signal,
    images,
  });
  ctx.charged(1, prompt.length + res.content.length);
  ctx.emit("reasoning.completed", { node: node.id, chars: res.content.length, provider: res.provider });
  return res;
}

const CODE_FORMAT = `${OUT_CODE} {"summary":"short design note","files":{"main.py":"…code…"}}
Rules: files values are plain file contents; keep to ≤3 files, each ≤60 KB; provide a runnable python entry named main.py when the language allows; never nest JSON inside code.`;

function parseCodePayload(content: string): { summary: string; files: Record<string, string> } {
  const { value, found } = extractJson(content);
  if (found && typeof value === "object" && value !== null) {
    const v = value as { summary?: unknown; files?: unknown };
    const files: Record<string, string> = {};
    if (v.files && typeof v.files === "object") {
      for (const [name, body] of Object.entries(v.files as Record<string, unknown>)) {
        if (!/^[a-zA-Z0-9_\-./]{1,80}$/.test(name) || /(^|\/)\.\.(\/|$)/.test(name)) continue;
        const text = String(body ?? "");
        if (text.length > 60_000) continue;
        files[name] = text;
      }
    }
    if (Object.keys(files).length) return { summary: String(v.summary ?? "").slice(0, 600), files };
  }
  // Fallback: bare ```code fences
  const fences = [...content.matchAll(/```([a-zA-Z0-9+_-]*)\n([\s\S]*?)```/g)];
  if (fences.length) {
    const files: Record<string, string> = {};
    fences.forEach((m, i) => {
      const lang = (m[1] ?? "").toLowerCase();
      const ext = lang === "python" || lang === "py" ? ".py" : lang === "javascript" || lang === "js" ? ".js" : lang === "typescript" || lang === "ts" ? ".ts" : ".txt";
      files[fences.length === 1 && ext === ".py" ? "main.py" : `code_${i + 1}${ext}`] = m[2];
    });
    return { summary: "code extracted from fenced blocks", files };
  }
  return { summary: "", files: {} };
}

/** Understand node: restate objective + pull relevant memory (no model call). */
async function execUnderstand(ctx: ExecContext, node: RavanaPlanNode): Promise<ExecOutcome> {
  const mem = await ctx.tools.run("memory.search", { query: ctx.task.objective.slice(0, 300), topK: 5, projectId: ctx.task.projectId ?? null });
  ctx.emit("memory.retrieved", {
    node: node.id,
    hits: Array.isArray(mem.data) ? (mem.data as unknown[]).length : 0,
    layers: Array.isArray(mem.data) ? [...new Set((mem.data as { layer?: string }[]).map((d) => d.layer ?? "?"))] : [],
  });
  const hits = Array.isArray(mem.data) ? (mem.data as { content: string; type: string }[]).slice(0, 5) : [];
  const output = [
    `Requirements restated for: ${ctx.task.objective.slice(0, 400)}`,
    hits.length ? `Relevant memory (${hits.length}):\n${hits.map((h) => `- [${h.type}] ${h.content.slice(0, 300)}`).join("\n")}` : "No directly relevant prior memory found.",
    `Plan shape: ${ctx.task.plan.length} step(s), kind=${ctx.task.kind}.`,
  ].join("\n\n");
  return { ok: true, output, files: {}, note: mem.summary };
}

/** Research node: gather web evidence (tool) — the reasoning node turns it into answers. */
async function execResearch(ctx: ExecContext, node: RavanaPlanNode): Promise<ExecOutcome> {
  const wantsWeb = node.tools.includes("web.search") || ctx.task.kind === "research";
  if (!wantsWeb) return { ok: true, output: "No evidence tool required for this step.", files: {} };
  const query = (node.description.includes("?") ? node.description : `${ctx.task.objective} ${node.description}`).slice(0, 300);
  const res = await ctx.tools.run("web.search", { query, maxResults: 5 });
  if (!res.ok) {
    if (res.error === "not configured") {
      return { ok: true, output: "[evidence step skipped] web.search is not configured (TAVILY_API_KEY). The answer will state this gap.", files: {}, note: res.summary };
    }
    return { ok: false, output: `[evidence step failed] ${res.error ?? res.summary}`, files: {}, note: res.summary };
  }
  const results = (res.data as { results?: { title: string; url: string; content: string }[] } | undefined)?.results ?? [];
  const output = [
    `Evidence gathered (${results.length} source(s)):`,
    ...results.map((r, i) => `${i + 1}. **${r.title}** — ${r.url}\n   ${(r.content ?? "").slice(0, 500)}`),
  ].join("\n");
  return { ok: true, output, files: {}, note: res.summary };
}

/** Code node: generate artifacts; the verifier's tests strategy executes them afterwards. */
async function execCode(ctx: ExecContext, node: RavanaPlanNode, fixHint?: string): Promise<ExecOutcome> {
  const prior = priorOutputs(ctx.task);
  const prompt = nodePrompt(ctx.task, node, { prior, fixHint }) + `\n\nRespond with EXACTLY:\n${CODE_FORMAT}`;
  const res = await callLlm(ctx, node, prompt, { maxTokens: 2400 });
  const { summary, files } = parseCodePayload(res.content);
  if (!Object.keys(files).length) {
    throw new ExecutorError("code step returned no parseable files — expected JSON with a files map or fenced code");
  }
  const output = summary ? `Design note: ${summary}\n\nFiles produced: ${Object.keys(files).join(", ")}` : `Files produced: ${Object.keys(files).join(", ")}`;
  return { ok: true, output, files, note: `${Object.keys(files).length} file(s)`, model: res };
}

/** Reason/synthesize nodes: model-generated content with full step context. */
async function execReason(ctx: ExecContext, node: RavanaPlanNode, fixHint?: string): Promise<ExecOutcome> {
  const prior = priorOutputs(ctx.task);
  const prompt = nodePrompt(ctx.task, node, { prior, fixHint }) + (node.type === "synthesize" ? "\nThis is the FINAL step: write the complete deliverable." : "");
  const res = await callLlm(ctx, node, prompt, { maxTokens: 2200 });
  return { ok: true, output: res.content.slice(0, 14_000), files: {}, note: `${res.content.length} chars`, model: res };
}

function priorOutputs(task: RavanaTask): string {
  const done = task.plan.filter((n) => n.status === "passed" && n.output?.trim());
  const body = done
    .map((n) => `• ${n.description}\n${(n.output ?? "").slice(0, 1600)}`)
    .join("\n\n");
  return body.slice(0, 9000);
}

/** Run one plan node. Throws ExecutorError on model-call failures (the loop retries). */
export async function execNode(ctx: ExecContext, node: RavanaPlanNode, fixHint?: string): Promise<ExecOutcome> {
  switch (node.type) {
    case "understand":
      return execUnderstand(ctx, node);
    case "research":
      return execResearch(ctx, node);
    case "code":
      return execCode(ctx, node, fixHint);
    default:
      return execReason(ctx, node, fixHint);
  }
}
