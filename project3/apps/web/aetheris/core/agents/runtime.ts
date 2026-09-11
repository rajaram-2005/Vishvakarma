/**
 * Agent Runtime (Phase 5) — first-class jobs around the Prime/specialist orchestrator.
 *
 *  Job = identity + task + budget + timeout + permissions + checkpoints + state machine
 *  queued → running → (paused|done|error|cancelled)
 *
 * Jobs run in the background (detached from the HTTP request), persist checkpoints after every
 * agent event, can be cancelled, and expose progress via GET/SSE. Budgets are enforced by counting
 * model calls and characters (all providers are free tier, so cost = calls, not dollars).
 */
import { randomBytes } from "node:crypto";
import { store } from "@/aetheris/lib/store";
import { orchestrate } from "@/aetheris/lib/agents/orchestrator";
import type { AgentEvent } from "@/aetheris/lib/agents/types";
import type { ChatMessage } from "@/aetheris/lib/router/types";
import { record } from "../observability/events";
import { authorize, principalFor } from "../policy/permissions";

export type JobStatus = "queued" | "running" | "done" | "error" | "cancelled" | "timeout" | "budget_exceeded";
export interface JobBudget { maxModelCalls: number; maxChars: number; timeoutMs: number; maxAgents: number }
export interface Checkpoint { at: number; event: AgentEvent["type"]; agent?: string; note?: string; partial?: string }
export interface Job {
  id: string; uid: string; title: string; task: string; status: JobStatus; createdAt: number; startedAt?: number; finishedAt?: number;
  budget: JobBudget; used: { modelCalls: number; chars: number; agents: string[] }; checkpoints: Checkpoint[]; output: string; error?: string;
  plan?: unknown; agents?: string[]; workspace?: string; parentId?: string; children: string[];
}
const COL = "agent_jobs";
export const DEFAULT_BUDGET: JobBudget = { maxModelCalls: 12, maxChars: 60_000, timeoutMs: 4 * 60_000, maxAgents: 3 };
const live = new Map<string, { controller: AbortController; listeners: Set<(e: AgentEvent | { type: "job"; job: Job }) => void> }>();

export const getJob = (id: string) => store.get<Job>(COL, id);
export async function listJobs(uid: string, limit = 30) { return Object.values(await store.all<Job>(COL)).filter((j) => j.uid === uid).sort((a, b) => b.createdAt - a.createdAt).slice(0, limit); }
async function save(j: Job) { await store.set(COL, j.id, j); live.get(j.id)?.listeners.forEach((l) => l({ type: "job", job: j })); }

/** Create and start a background job. Returns immediately. */
export async function submitJob(opts: { uid: string; task: string; title?: string; system?: string; agents?: string[]; budget?: Partial<JobBudget>; history?: ChatMessage[]; parentId?: string; workspace?: string; policy?: { allow?: string[]; allowKeyless?: boolean; maxTokens?: number } }): Promise<Job> {
  const budget = { ...DEFAULT_BUDGET, ...opts.budget };
  const job: Job = { id: randomBytes(6).toString("hex"), uid: opts.uid, title: (opts.title ?? opts.task).slice(0, 80), task: opts.task, status: "queued", createdAt: Date.now(), budget, used: { modelCalls: 0, chars: 0, agents: [] }, checkpoints: [], output: "", parentId: opts.parentId, children: [], workspace: opts.workspace, agents: opts.agents };
  await save(job);
  const auth = authorize({ principal: principalFor(opts.uid), capabilityId: "system:agent-runtime", required: "read_only" });
  if (!auth.allow) { job.status = "error"; job.error = auth.reason; await save(job); return job; }
  void run(job, opts).catch(() => undefined);
  return job;
}

async function run(job: Job, opts: Parameters<typeof submitJob>[0]) {
  const controller = new AbortController();
  const entry = { controller, listeners: new Set<(e: AgentEvent | { type: "job"; job: Job }) => void>() };
  live.set(job.id, entry);
  job.status = "running"; job.startedAt = Date.now(); await save(job);
  const timer = setTimeout(() => { job.status = "timeout"; controller.abort(); }, job.budget.timeoutMs);
  let acc = ""; let lastSave = 0;
  const checkpoint = async (c: Checkpoint) => { job.checkpoints.push(c); if (job.checkpoints.length > 200) job.checkpoints.splice(0, job.checkpoints.length - 200); if (Date.now() - lastSave > 1500) { lastSave = Date.now(); await save(job); } };
  const messages: ChatMessage[] = [{ role: "system", content: opts.system ?? "You are Aetheris running a background job. Produce the complete deliverable." }, ...(opts.history ?? []), { role: "user", content: job.task }];
  try {
    await orchestrate({
      messages, agents: opts.agents, signal: controller.signal, ctx: { uid: job.uid },
      policy: { maxAgents: job.budget.maxAgents, parallel: true, critique: false, allow: opts.policy?.allow, allowKeyless: opts.policy?.allowKeyless ?? true, maxTokens: opts.policy?.maxTokens },
      onEvent: (e) => {
        entry.listeners.forEach((l) => l(e));
        if (e.type === "plan") { job.plan = e.plan; void checkpoint({ at: Date.now(), event: "plan", note: (e.plan as { reason?: string }).reason }); }
        if (e.type === "agent_start") { job.used.modelCalls++; if (!job.used.agents.includes(e.agent)) job.used.agents.push(e.agent); void checkpoint({ at: Date.now(), event: "agent_start", agent: e.agent, note: e.brief?.slice(0, 200) }); }
        if (e.type === "agent_done") void checkpoint({ at: Date.now(), event: "agent_done", agent: e.agent, note: `${e.chars} chars via ${e.provider}` });
        if (e.type === "agent_error") void checkpoint({ at: Date.now(), event: "agent_error", agent: e.agent, note: e.error });
        if (e.type === "delta") { acc += e.text; job.used.chars += e.text.length; if (job.used.chars > job.budget.maxChars) { job.status = "budget_exceeded"; controller.abort(); } }
        if (job.used.modelCalls > job.budget.maxModelCalls) { job.status = "budget_exceeded"; controller.abort(); }
      },
    });
    if (job.status === "running") job.status = "done";
  } catch (e) {
    if (job.status === "running") { job.status = controller.signal.aborted ? "cancelled" : "error"; job.error = (e as Error).message.slice(0, 500); }
  } finally {
    clearTimeout(timer);
    job.output = acc; job.finishedAt = Date.now();
    job.checkpoints.push({ at: Date.now(), event: "done", note: job.status, partial: acc.slice(-400) });
    await save(job);
    record({ type: "agent", uid: job.uid, capability: "system:agent-runtime", ok: job.status === "done", ms: job.finishedAt - (job.startedAt ?? job.createdAt), detail: `${job.title} → ${job.status}`, meta: { modelCalls: job.used.modelCalls, chars: job.used.chars, agents: job.used.agents } });
    live.delete(job.id);
    // Automation "job" triggers (best-effort, never throws into the runtime)
    import("../automation/engine").then(({ onJobFinished }) => onJobFinished(job.uid, { id: job.id, title: job.title, status: job.status, result: acc })).catch(() => undefined);
  }
}

export async function cancelJob(uid: string, id: string): Promise<Job | null> {
  const j = await getJob(id); if (!j || j.uid !== uid) return null;
  const l = live.get(id);
  if (l) { j.status = "cancelled"; await save(j); l.controller.abort(); }
  else if (j.status === "queued" || j.status === "running") { j.status = "cancelled"; j.finishedAt = Date.now(); await save(j); }
  return j;
}
/** Retry a finished job with the same task (new job, linked via parentId). */
export async function retryJob(uid: string, id: string) { const j = await getJob(id); if (!j || j.uid !== uid) return null; return submitJob({ uid, task: j.task, title: j.title, agents: j.agents, budget: j.budget, parentId: j.id }); }
/** Subscribe to live events of a running job (returns unsubscribe). */
export function subscribe(id: string, cb: (e: AgentEvent | { type: "job"; job: Job }) => void): (() => void) | null { const l = live.get(id); if (!l) return null; l.listeners.add(cb); return () => l.listeners.delete(cb); }
export const isLive = (id: string) => live.has(id);
export async function runtimeSummary(uid?: string) { const all = Object.values(await store.all<Job>(COL)).filter((j) => !uid || j.uid === uid); const by: Record<string, number> = {}; for (const j of all) by[j.status] = (by[j.status] ?? 0) + 1; return { total: all.length, live: live.size, byStatus: by }; }
