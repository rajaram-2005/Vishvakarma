import { traced } from "@/aetheris/core/observability/events";
import { randomBytes } from "node:crypto";
import { store } from "@/aetheris/lib/store";
import { route } from "@/aetheris/lib/router/router";
import { agentById, HERMES_BASE } from "@/aetheris/lib/agents/catalog";
import type { ChatMessage } from "@/aetheris/lib/router/types";

/**
 * Workflows: saved multi-step automations. Each step runs one agent with a templated prompt;
 * `{{input}}` is the workflow input and `{{steps.<id>}}` references an earlier step's output.
 * Steps can also `transform` (pure text ops) or `branch` on a condition. Runs stream events.
 */
export interface WorkflowStep {
  id: string;
  title: string;
  kind: "agent" | "transform" | "branch";
  /** kind=agent */
  agent?: string;
  prompt?: string;
  /** kind=transform: "extract_json" | "bullets" | "first_line" | "upper" | "trim:N" */
  op?: string;
  /** kind=branch: run `then` step id if regex matches input text, else `else` */
  when?: string; then?: string; else?: string;
  /** input template; defaults to previous step output */
  input?: string;
}
export interface Workflow { id: string; uid: string; name: string; description: string; inputLabel: string; steps: WorkflowStep[]; public: boolean; createdAt: number; updatedAt: number; runs: number }
export interface WorkflowRun { id: string; workflowId: string; uid: string; input: string; outputs: Record<string, string>; final: string; startedAt: number; finishedAt?: number; status: "running" | "done" | "error"; error?: string }

const WF = "workflows"; const RUNS = "workflow_runs";

export function fill(template: string, ctx: { input: string; steps: Record<string, string>; prev: string }): string {
  return template
    .replace(/\{\{\s*input\s*\}\}/g, ctx.input)
    .replace(/\{\{\s*prev\s*\}\}/g, ctx.prev)
    .replace(/\{\{\s*steps\.([\w-]+)\s*\}\}/g, (_, id: string) => ctx.steps[id] ?? "");
}

export function transform(op: string, text: string): string {
  if (op === "extract_json") { const m = /\{[\s\S]*\}|\[[\s\S]*\]/.exec(text); return m ? m[0] : ""; }
  if (op === "bullets") return text.split(/\n+/).map((l) => l.trim()).filter(Boolean).map((l) => (l.startsWith("-") ? l : `- ${l}`)).join("\n");
  if (op === "first_line") return text.split("\n").find((l) => l.trim()) ?? "";
  if (op === "upper") return text.toUpperCase();
  if (op === "strip_code") return text.replace(/```[\s\S]*?```/g, "").trim();
  const trim = /^trim:(\d+)$/.exec(op); if (trim) return text.slice(0, Number(trim[1]));
  return text;
}

export function validate(steps: WorkflowStep[]): string | null {
  if (!Array.isArray(steps) || steps.length === 0) return "at least one step";
  if (steps.length > 12) return "max 12 steps";
  const ids = new Set<string>();
  for (const s of steps) {
    if (!s.id || !/^[\w-]{1,32}$/.test(s.id)) return `bad step id ${s.id}`;
    if (ids.has(s.id)) return `duplicate step id ${s.id}`; ids.add(s.id);
    if (s.kind === "agent" && (!s.agent || !agentById(s.agent))) return `unknown agent in step ${s.id}`;
    if (s.kind === "agent" && !s.prompt) return `step ${s.id} needs a prompt`;
    if (s.kind === "transform" && !s.op) return `step ${s.id} needs an op`;
    if (s.kind === "branch" && !s.when) return `step ${s.id} needs a when regex`;
  }
  return null;
}

export async function listWorkflows(uid: string): Promise<Workflow[]> {
  const all = Object.values(await store.all<Workflow>(WF));
  return all.filter((w) => w.uid === uid || w.public).sort((a, b) => b.updatedAt - a.updatedAt);
}
export const getWorkflow = (id: string) => store.get<Workflow>(WF, id);
export async function saveWorkflow(uid: string, w: Partial<Workflow> & { name: string; steps: WorkflowStep[] }, id?: string): Promise<Workflow> {
  const err = validate(w.steps); if (err) throw new Error(err);
  const cur = id ? await getWorkflow(id) : undefined;
  if (cur && cur.uid !== uid) throw new Error("forbidden");
  const wf: Workflow = { id: cur?.id ?? randomBytes(5).toString("base64url"), uid, name: w.name.slice(0, 80), description: (w.description ?? "").slice(0, 300), inputLabel: (w.inputLabel ?? "Input").slice(0, 60), steps: w.steps, public: !!w.public, createdAt: cur?.createdAt ?? Date.now(), updatedAt: Date.now(), runs: cur?.runs ?? 0 };
  await store.set(WF, wf.id, wf);
  return wf;
}
export async function deleteWorkflow(uid: string, id: string) { const w = await getWorkflow(id); if (!w) return false; if (w.uid !== uid) throw new Error("forbidden"); await store.remove(WF, id); return true; }

export type WfEvent =
  | { type: "start"; runId: string; steps: string[] }
  | { type: "step_start"; step: string; title: string; agent?: string }
  | { type: "step_delta"; step: string; text: string }
  | { type: "step_done"; step: string; output: string; provider?: string; skipped?: boolean }
  | { type: "done"; runId: string; final: string; ms: number }
  | { type: "error"; step?: string; error: string };

export async function runWorkflow(wf: Workflow, uid: string, input: string, opts: { onEvent: (e: WfEvent) => void; signal?: AbortSignal; allow?: string[]; allowKeyless?: boolean; maxTokens?: number; baseSystem?: string }): Promise<WorkflowRun> {
  return traced({ type: "agent", uid: uid, capability: "automation:workflows" }, () => runWorkflowInner(wf, uid, input, opts));
}
async function runWorkflowInner(wf: Workflow, uid: string, input: string, opts: { onEvent: (e: WfEvent) => void; signal?: AbortSignal; allow?: string[]; allowKeyless?: boolean; maxTokens?: number; baseSystem?: string }): Promise<WorkflowRun> {
  const run: WorkflowRun = { id: randomBytes(6).toString("hex"), workflowId: wf.id, uid, input, outputs: {}, final: "", startedAt: Date.now(), status: "running" };
  await store.set(RUNS, run.id, run);
  opts.onEvent({ type: "start", runId: run.id, steps: wf.steps.map((s) => s.id) });
  const skip = new Set<string>();
  let prev = input;
  try {
    for (const step of wf.steps) {
      if (skip.has(step.id)) { opts.onEvent({ type: "step_done", step: step.id, output: "", skipped: true }); continue; }
      const ctx = { input, steps: run.outputs, prev };
      const stepInput = step.input ? fill(step.input, ctx) : prev;
      opts.onEvent({ type: "step_start", step: step.id, title: step.title, agent: step.agent });
      let out = ""; let provider: string | undefined;
      if (step.kind === "transform") out = transform(step.op!, stepInput);
      else if (step.kind === "branch") {
        const ok = new RegExp(step.when!, "i").test(stepInput);
        const chosen = ok ? step.then : step.else; const other = ok ? step.else : step.then;
        if (other) skip.add(other);
        out = stepInput; // pass-through
        if (chosen === undefined) out = stepInput;
      } else {
        const spec = agentById(step.agent!)!;
        const messages: ChatMessage[] = [
          { role: "system", content: `${opts.baseSystem ?? ""}\n\n${HERMES_BASE}\n\n${spec.system}`.trim() },
          { role: "user", content: fill(step.prompt!, ctx) + (step.input || !/\{\{\s*(input|prev|steps\.)/.test(step.prompt!) ? `\n\n---\nInput:\n${stepInput}` : "") },
        ];
        let acc = "";
        const r = await route({ messages, temperature: spec.temperature, allow: opts.allow, allowKeyless: opts.allowKeyless, maxTokens: opts.maxTokens, signal: opts.signal, onDelta: (t) => { acc += t; opts.onEvent({ type: "step_delta", step: step.id, text: t }); } });
        out = r.content || acc; provider = r.provider;
      }
      run.outputs[step.id] = out; prev = out;
      opts.onEvent({ type: "step_done", step: step.id, output: out, provider });
    }
    run.final = prev; run.status = "done"; run.finishedAt = Date.now();
    await store.update<Workflow>(WF, wf.id, (w) => ({ ...(w ?? wf), runs: (w?.runs ?? 0) + 1 }));
    opts.onEvent({ type: "done", runId: run.id, final: run.final, ms: run.finishedAt - run.startedAt });
  } catch (e) {
    run.status = "error"; run.error = (e as Error).message; run.finishedAt = Date.now();
    opts.onEvent({ type: "error", error: run.error });
  }
  await store.set(RUNS, run.id, run);
  return run;
}

export async function listRuns(uid: string, workflowId?: string, limit = 20): Promise<WorkflowRun[]> {
  return Object.values(await store.all<WorkflowRun>(RUNS)).filter((r) => r.uid === uid && (!workflowId || r.workflowId === workflowId)).sort((a, b) => b.startedAt - a.startedAt).slice(0, limit).map((r) => ({ ...r, outputs: {} }));
}

/** Starter workflows shown to everyone (public, owned by "aetheris"). */
export const TEMPLATES: Omit<Workflow, "id" | "uid" | "createdAt" | "updatedAt" | "runs">[] = [
  { name: "Blog post pipeline", description: "Research → outline → draft → edit → SEO title & meta.", inputLabel: "Topic", public: true, steps: [
    { id: "research", title: "Research the topic", kind: "agent", agent: "researcher", prompt: "Gather the 8 most important, current facts and 3 credible sources about: {{input}}. Output as bullets with source names." },
    { id: "outline", title: "Outline", kind: "agent", agent: "writer", prompt: "Create a blog outline (H2/H3) for '{{input}}' using these notes:\n{{steps.research}}" },
    { id: "draft", title: "Write the draft", kind: "agent", agent: "writer", prompt: "Write a 900-word blog post following this outline exactly. Conversational, concrete, no fluff.\n{{steps.outline}}" },
    { id: "edit", title: "Edit", kind: "agent", agent: "editor", prompt: "Edit for clarity, flow and grammar. Keep structure. Return the full edited post.\n{{steps.draft}}" },
    { id: "seo", title: "SEO title & meta", kind: "agent", agent: "seo", prompt: "For this post give: 3 SEO titles (≤60 chars), a meta description (≤155 chars), 5 tags. Then append the full post unchanged.\n{{steps.edit}}" },
  ] },
  { name: "Code review + tests", description: "Review a code snippet, fix issues, write tests, summarise.", inputLabel: "Paste code", public: true, steps: [
    { id: "review", title: "Review", kind: "agent", agent: "reviewer", prompt: "Review this code. List bugs, security issues and style problems with line references.\n```\n{{input}}\n```" },
    { id: "fix", title: "Apply fixes", kind: "agent", agent: "coder", prompt: "Apply all fixes from the review to the code and return the complete corrected file only.\nReview:\n{{steps.review}}\n\nCode:\n```\n{{input}}\n```" },
    { id: "tests", title: "Write tests", kind: "agent", agent: "qa", prompt: "Write a focused unit test suite for this code (same language/framework conventions). Return the full test file.\n{{steps.fix}}" },
    { id: "summary", title: "Summary", kind: "agent", agent: "notes", prompt: "Summarise what changed and why in ≤8 bullets, then append the fixed code and the tests.\nReview:\n{{steps.review}}\nFixed:\n{{steps.fix}}\nTests:\n{{steps.tests}}" },
  ] },
  { name: "Startup idea validator", description: "Customer → market → risks → MVP scope → one-page memo.", inputLabel: "Describe the idea", public: true, steps: [
    { id: "customer", title: "Customer & pain", kind: "agent", agent: "product", prompt: "For this idea identify the primary customer, their top 3 pains, and how they solve it today: {{input}}" },
    { id: "market", title: "Market & competitors", kind: "agent", agent: "strategist", prompt: "Estimate TAM/SAM/SOM (show assumptions) and list 5 competitors with their weakness for: {{input}}\nCustomer notes: {{steps.customer}}" },
    { id: "risks", title: "Risks (pre-mortem)", kind: "agent", agent: "decision", prompt: "Run a pre-mortem: the startup failed after 18 months — list the 6 most likely reasons and an early signal for each.\nIdea: {{input}}\nMarket: {{steps.market}}" },
    { id: "mvp", title: "MVP scope", kind: "agent", agent: "founder", prompt: "Define a 4-week MVP: features (must/should/won't), success metric, and the cheapest test of the riskiest assumption.\nIdea: {{input}}\nRisks: {{steps.risks}}" },
    { id: "memo", title: "One-page memo", kind: "agent", agent: "writer", prompt: "Write a crisp one-page investment memo (problem, customer, market, why now, MVP, risks, ask) from:\n{{steps.customer}}\n{{steps.market}}\n{{steps.risks}}\n{{steps.mvp}}" },
  ] },
  { name: "Lesson plan (any subject)", description: "Explain → examples → quiz → answer key, tuned to level.", inputLabel: "Topic and level, e.g. 'Photosynthesis, class 10'", public: true, steps: [
    { id: "explain", title: "Explain", kind: "agent", agent: "tutor", prompt: "Explain {{input}} at the stated level in ~400 words with one analogy and one diagram described in words." },
    { id: "examples", title: "Worked examples", kind: "agent", agent: "tutor", prompt: "Give 3 worked examples/problems with step-by-step solutions for {{input}}. Base them on:\n{{steps.explain}}" },
    { id: "quiz", title: "Quiz", kind: "agent", agent: "quiz", prompt: "Write a 10-question quiz (6 MCQ, 4 short answer) on {{input}}. Do NOT include answers." },
    { id: "key", title: "Answer key + plan", kind: "agent", agent: "tutor", prompt: "Provide the answer key with one-line explanations for this quiz, then assemble the full lesson: explanation, examples, quiz, key.\nQuiz:\n{{steps.quiz}}\nExplanation:\n{{steps.explain}}\nExamples:\n{{steps.examples}}" },
  ] },
  { name: "Tamil + Hindi translation pack", description: "Translate content into Tamil and Hindi with register notes.", inputLabel: "English text", public: true, steps: [
    { id: "ta", title: "Tamil", kind: "agent", agent: "tamil", prompt: "Translate faithfully into natural written Tamil (எழுத்துத் தமிழ்). Then add 2 lines noting any terms you adapted.\n{{input}}" },
    { id: "hi", title: "Hindi", kind: "agent", agent: "hindi", prompt: "Translate faithfully into natural Hindi (Devanagari). Then add 2 lines noting any terms you adapted.\n{{input}}" },
    { id: "pack", title: "Assemble", kind: "agent", agent: "editor", prompt: "Assemble a translation pack with three sections: English (original), தமிழ், हिन्दी. Keep translations unchanged.\nEnglish:\n{{input}}\nTamil:\n{{steps.ta}}\nHindi:\n{{steps.hi}}" },
  ] },
];

export async function ensureTemplates() {
  const all = await store.all<Workflow>(WF);
  if (Object.values(all).some((w) => w.uid === "aetheris")) return;
  for (const t of TEMPLATES) { const id = "tpl-" + t.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 24); await store.set<Workflow>(WF, id, { ...t, id, uid: "aetheris", createdAt: 1_750_000_000_000, updatedAt: 1_750_000_000_000, runs: 0 }); }
}
