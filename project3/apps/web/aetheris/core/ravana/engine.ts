/**
 * RAVANA · Core engine (spec §3 pipeline: Understand → Plan → Reason → Retrieve → Tools →
 * Observe → Verify → Correct; spec §8 agent loop; spec §29 final architecture).
 *
 * The engine is deliberately transport-agnostic: it reads/writes `RavanaTask` records, emits
 * typed events, and is driven by the REST/SSE layer. Everything external (LlmLike binding, tool
 * gate, permission decisions) is injected per run, so the full loop runs under tests offline.
 */
import { randomBytes } from "node:crypto";
import { store } from "@/aetheris/lib/store";
import { record } from "../observability/events";
import { authorize, issueConfirmation, principalFor, type Principal } from "../policy/permissions";
import { attach, detach, emit } from "./events";
import { classifyTask } from "./classifier";
import { buildPlan } from "./planner";
import type { RavanaEngine, RavanaEventType, RavanaKind, RavanaModelUse, RavanaPlanNode, RavanaPriority, RavanaTask, RavanaTaskStatus, RavanaToolUse } from "./types";
import { MeshLlm } from "./models/mesh";
import { PreviewLlm } from "./models/preview";
import { execNode, ExecutorError, type ExecContext, type ToolGate } from "./agents/executor";
import { blockedNodes, planDone, planFailed, readyNodes } from "./agents/scheduler";
import { checkFinal, checkNode } from "./verification/verifier";
import * as memoryStores from "./memory/stores";
import { rememberEpisode } from "./memory/manager";
import { bootTools, toolCapabilityId, type RavanaToolRuntime } from "./tools";
import type { ToolResult } from "./tools/registry";

const COL = "ravana_tasks";

export const DEFAULT_BUDGET = { maxModelCalls: 40, maxChars: 160_000, timeoutMs: 12 * 60_000, maxNodes: 12, verify: true };
export const MAX_REPLANS = 2;
export const MAX_NODE_ATTEMPTS = 2;
const WAVE_CONCURRENCY = 2;

export interface CreateTaskInput {
  uid: string;
  objective: string;
  title?: string;
  context?: string;
  images?: string[];
  projectId?: string | null;
  priority?: RavanaPriority;
  engine?: RavanaEngine;
  budget?: Partial<typeof DEFAULT_BUDGET>;
  kind?: RavanaKind;
  autoStart?: boolean;
}

interface LiveRun {
  controller: AbortController;
  saveTimer?: NodeJS.Timeout | null;
  dirty: boolean;
}

const runs = new Map<string, LiveRun>();
const waits = new Map<string, { resolve: (d: { approved: boolean }) => void }>();

export const getTask = (id: string) => store.get<RavanaTask>(COL, id);
export async function listTasks(uid: string, opts: { status?: RavanaTaskStatus[]; projectId?: string | null; limit?: number } = {}): Promise<RavanaTask[]> {
  const all = Object.values(await store.all<RavanaTask>(COL));
  return all
    .filter((t) => t.uid === uid && (!opts.status?.length || opts.status.includes(t.status)) && (opts.projectId === undefined || (t.projectId ?? null) === opts.projectId))
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, opts.limit ?? 50);
}

export function toPublic(t: RavanaTask) {
  const { images: _imgs, ...rest } = t;
  void _imgs;
  return rest;
}

// ------------------------------------------------------------ task record management

function newTaskId(): string {
  return "rvn_" + randomBytes(5).toString("hex");
}

function freshTask(input: CreateTaskInput, budget: typeof DEFAULT_BUDGET): RavanaTask {
  const classified = classifyTask(input.objective, { hasImages: !!input.images?.length, contextLength: (input.context ?? "").length + input.objective.length });
  const task: RavanaTask = {
    id: newTaskId(),
    uid: input.uid,
    projectId: input.projectId ?? null,
    title: (input.title ?? input.objective).trim().slice(0, 90),
    objective: input.objective.trim().slice(0, 20_000),
    context: input.context?.slice(0, 40_000),
    images: input.images?.slice(0, 3),
    kind: input.kind ?? classified.kind,
    kindReason: classified.kindReason,
    priority: input.priority ?? classified.priority,
    status: "queued",
    engine: input.engine ?? "auto",
    budget,
    used: { modelCalls: 0, chars: 0, steps: 0 },
    plan: [],
    createdAt: Date.now(),
    events: [],
    pendingTool: null,
  };
  return task;
}

/** Persist with debounce while a run is live (events can be chatty); force on terminal states. */
async function saveTask(t: RavanaTask, force = false): Promise<void> {
  const run = runs.get(t.id);
  const persist = () => store.set(COL, t.id, persistable(t));
  if (!force && run) {
    run.dirty = true;
    if (!run.saveTimer) {
      run.saveTimer = setTimeout(() => {
        run.saveTimer = null;
        if (run.dirty) {
          run.dirty = false;
          void persist();
        }
      }, 700);
    }
    return;
  }
  if (run?.saveTimer) { clearTimeout(run.saveTimer); run.saveTimer = null; }
  if (run) run.dirty = false;
  await persist();
}

/** Images can be megabytes — they live only in the in-memory task while it runs. */
function persistable(t: RavanaTask): RavanaTask {
  const { images, ...rest } = t;
  void images;
  return rest;
}

// ------------------------------------------------------------ public entry points

/** Create (and auto-start) a task. task.created is emitted here, the run emits the rest. */
export async function createTask(input: CreateTaskInput): Promise<RavanaTask> {
  const budget = { ...DEFAULT_BUDGET, ...input.budget };
  const task = freshTask(input, budget);
  attach(task.id);
  emit(task, "task.created", { kind: task.kind, kindReason: task.kindReason, engine: task.engine, priority: task.priority, projectId: task.projectId ?? null });
  await saveTask(task, true);
  const auth = authorize({ principal: principalFor(input.uid), capabilityId: "ravana:run", required: "read_only" });
  if (!auth.allow) {
    task.status = "failed";
    task.finishedAt = Date.now();
    task.error = `authorization refused: ${auth.reason}`;
    emit(task, "task.failed", { error: task.error });
    await saveTask(task, true);
    return task;
  }
  if (input.autoStart !== false) void run(task.id);
  return task;
}

export async function cancelTask(uid: string, id: string): Promise<RavanaTask | null> {
  const task = await getTask(id);
  if (!task || task.uid !== uid || task.status === "completed") return task ?? null;
  if (task.status === "cancelled" || task.status === "timeout") return task;
  task.status = "cancelled";
  task.finishedAt = Date.now();
  emit(task, "task.cancelled", {});
  runs.get(id)?.controller.abort();
  const w = waits.get(id);
  if (w) { w.resolve({ approved: false }); waits.delete(id); }
  await saveTask(task, true);
  return task;
}

/** Approve (with the issued token) or reject the tool request a task is paused on. */
export async function confirmToolRequest(uid: string, id: string, opts: { approve: boolean; confirmationToken?: string }): Promise<{ task?: RavanaTask; error?: string }> {
  const task = await getTask(id);
  if (!task || task.uid !== uid) return { error: "not found" };
  if (task.status !== "awaiting_confirmation" || !task.pendingTool) return { error: "task is not waiting for a confirmation" };
  const pending = task.pendingTool;
  const w = waits.get(id);
  if (!w) return { error: "task is no longer live" };
  if (!opts.approve) {
    waits.delete(id);
    task.pendingTool = null;
    w.resolve({ approved: false });
    emit(task, "task.resumed", { tool: pending.name, approved: false });
    await saveTask(task, true);
    return { task };
  }
  // Validate the single-use token against the capability that paused the task.
  const d = authorize({
    principal: principalFor(uid),
    capabilityId: pending.capabilityId,
    required: (pending.required ?? "full_workspace") as "read_only" | "safe_write" | "full_workspace",
    requiresConfirmation: true,
    confirmationToken: opts.confirmationToken,
  });
  if (!d.allow) return { error: d.reason };
  waits.delete(id);
  task.pendingTool = null;
  task.status = "running";
  w.resolve({ approved: true });
  emit(task, "task.resumed", { tool: pending.name, approved: true });
  await saveTask(task, true);
  return { task };
}

/** Start the agent loop for an existing task (idempotent; run() guards terminal states). */
export function startRun(id: string): void {
  void run(id);
}

export async function taskStats(uid: string) {
  const all = Object.values(await store.all<RavanaTask>(COL)).filter((t) => t.uid === uid);
  const by: Record<string, number> = {};
  for (const t of all) by[t.status] = (by[t.status] ?? 0) + 1;
  const finished = all.filter((t) => t.status === "completed" || t.status === "failed");
  const done = all.filter((t) => t.status === "completed").length;
  const successRate = finished.length ? Math.round((done / finished.length) * 1000) / 10 : null;
  const totalMs = all.filter((t) => t.summary?.ms).reduce((n, t) => n + (t.summary!.ms ?? 0), 0);
  const withMs = all.filter((t) => t.summary?.ms).length;
  return {
    total: all.length,
    byStatus: by,
    completed: done,
    failed: all.filter((t) => t.status === "failed").length,
    successRate,
    live: [...runs.values()].filter((r) => !r.controller.signal.aborted).length,
    avgLatencyMs: withMs ? Math.round(totalMs / withMs) : null,
    modelCalls: all.reduce((n, t) => n + t.used.modelCalls, 0),
    steps: all.reduce((n, t) => n + t.used.steps, 0),
  };
}

// ------------------------------------------------------------ the agent loop

async function run(id: string): Promise<void> {
  const task = await getTask(id);
  if (!task || runs.has(id) || task.status === "completed" || task.status === "cancelled" || task.status === "failed" || task.status === "timeout") return;
  attach(id);
  const controller = new AbortController();
  const runEntry: LiveRun = { controller, dirty: false };
  runs.set(id, runEntry);
  const timer = setTimeout(() => {
    if (task.status === "queued" || task.status === "planning" || task.status === "running" || task.status === "awaiting_confirmation") {
      task.status = "timeout";
    }
    controller.abort();
  }, task.budget.timeoutMs);

  try {
    await drive(task, controller);
  } catch (e) {
    if (!["completed", "failed", "cancelled", "timeout"].includes(task.status)) {
      task.status = "failed";
      task.error = `engine error: ${(e as Error).message.slice(0, 600)}`;
      emit(task, "task.failed", { error: task.error });
    }
  } finally {
    clearTimeout(timer);
    if (task.finishedAt === undefined && ["failed", "cancelled", "timeout"].includes(task.status)) task.finishedAt = Date.now();
    finalizeSummary(task);
    await saveTask(task, true);
    const finalStatus = task.status as RavanaTaskStatus;
    record({
      type: "agent",
      uid: task.uid,
      capability: "ravana:engine",
      ok: finalStatus === "completed",
      ms: task.finishedAt ? task.finishedAt - task.createdAt : undefined,
      detail: `${task.id} · ${task.kind} · ${task.engineResolved ?? task.engine} → ${finalStatus}`,
      meta: { taskId: task.id, modelCalls: task.used.modelCalls, steps: task.used.steps, kind: task.kind },
    });
    await finishMemory(task);
    runs.delete(id);
    detach(id);
  }
}

async function drive(task: RavanaTask, controller: AbortController): Promise<void> {
  // ENGINE SELECTION — "auto" resolves before any work: mesh when a provider exists, else preview.
  const engine = await resolveEngine(task.engine);
  task.engineResolved = engine;
  emit(task, "engine.selected", { engine, label: engine === "preview" ? "Preview responder — deterministic demo, no model calls" : "Aetheris model mesh with role routing" });
  await saveTask(task, true);

  // PLANNING → task graph (model-drafted for deep goals on the mesh; templates otherwise)
  const classified = classifyTask(task.objective, { hasImages: !!task.images?.length, contextLength: (task.context ?? "").length });
  const llm = engine === "mesh" ? new MeshLlm((sel) => {
    if (sel.primary) emit(task, "model.selected", { role: sel.role, provider: sel.primary.id, model: sel.primary.model, purpose: "plan", reason: sel.reason.slice(0, 220) });
  }) : new PreviewLlm();
  task.status = "planning";
  await saveTask(task, true);
  const needsLabel = [classified.needs.vision && "vision", classified.needs.web && "web", classified.needs.tools && "tools", classified.needs.sandbox && "sandboxed-execution", classified.needs.longContext && "long-context"].filter(Boolean).join(", ") || "general";
  const built = await buildPlan({
    kind: task.kind,
    objective: task.objective,
    needsLabel,
    depth: classified.planDepth,
    llm: engine === "mesh" ? llm : null,
    signal: controller.signal,
  });
  task.plan = trimPlan(built.nodes, task.budget.maxNodes);
  emit(task, "task.planned", { nodes: task.plan.length, via: built.via, plannerModel: built.plannerProvider ?? null, rationale: built.rationale?.slice(0, 300) });
  task.status = "running";
  task.startedAt = Date.now();
  emit(task, "task.started", { plan: built.via, kind: task.kind });
  await saveTask(task, true);

  const principal = principalFor(task.uid);
  const tools: ToolGate = {
    preview: engine === "preview",
    run: (name, args, opts) => gateTool(task, principal, name, args, controller, opts?.purpose),
  };
  const execCtx: ExecContext = {
    uid: task.uid,
    task,
    llm,
    tools,
    signal: controller.signal,
    emit: (type, payload) => emit(task, type as RavanaEventType, payload),
    charged: (calls, chars) => {
      task.used.modelCalls += calls;
      task.used.chars += chars;
    },
  };

  // AGENT LOOP — waves of ready nodes; per-node verify + correct; plan-level recovery.
  let replans = 0;
  const st = () => task.status as RavanaTaskStatus;
  for (;;) {
    if (controller.signal.aborted) {
      if (st() !== "timeout") task.status = "cancelled";
      break;
    }
    if (st() === "awaiting_confirmation" && task.pendingTool) {
      const ok = await waitForConfirmation(task.id, controller);
      if (!ok) break;
      task.status = "running";
      continue;
    }
    const ready = readyNodes(task.plan, WAVE_CONCURRENCY);
    if (ready.length) {
      await Promise.all(ready.map((n) => executeNode(execCtx, n, controller)));
      await saveTask(task, true);
      if (task.used.modelCalls > task.budget.maxModelCalls) {
        task.status = "failed";
        task.error = `model budget exceeded (${task.budget.maxModelCalls} calls)`;
        emit(task, "task.failed", { error: task.error });
        break;
      }
      if (task.used.chars > task.budget.maxChars) {
        task.status = "failed";
        task.error = `character budget exceeded (${task.budget.maxChars})`;
        emit(task, "task.failed", { error: task.error });
        break;
      }
      continue;
    }
    if (planDone(task.plan)) break;

    // blocked nodes (dependency failed): evidence/understanding steps degrade gracefully
    const blocked = blockedNodes(task.plan);
    const graceful = blocked.filter((b) => b.type === "understand" || b.type === "research");
    for (const b of graceful) {
      b.status = "skipped";
      b.note = "dependency failed — step skipped; the deliverable will state the gap";
    }
    if (blocked.length && blocked.every((b) => b.status === "skipped")) continue;

    if (planFailed(task.plan) && replans < MAX_REPLANS && task.plan.length < task.budget.maxNodes) {
      replans += 1;
      const failed = task.plan.filter((n) => n.status === "failed").map((n) => n.id);
      revisePlan(task);
      task.summary = task.summary ?? { engine, engineLabel: "", modelsUsed: [], toolsUsed: [], steps: 0, replans: 0 };
      task.summary.replans = replans;
      emit(task, "task.replanned", { attempt: replans, failed });
      await saveTask(task, true);
      continue;
    }

    // give up: mark the rest skipped and fail honestly with the partial deliverable
    for (const n of task.plan) if (n.status === "pending") { n.status = "skipped"; n.note = "blocked by an earlier failed step"; }
    const failed = task.plan.filter((n) => n.status === "failed");
    task.error = `steps failed after ${replans} replan(s): ${failed.map((n) => `${n.id} (${n.description.slice(0, 70)})`).join("; ") || "unknown"}`;
    task.status = "failed";
    task.finishedAt = Date.now();
    composePartial(task);
    emit(task, "task.failed", { error: task.error });
    await saveTask(task, true);
    return;
  }

  if (st() === "cancelled" || st() === "timeout") {
    emit(task, "task.cancelled", { reason: st() });
    await saveTask(task, true);
    return;
  }

  // FINAL VERIFICATION + SYNTHESIS (verification is mandatory, spec §9)
  const deliverable = composeDeliverable(task);
  const verification = await checkFinal(task, deliverable, {
    llm: engine === "mesh" ? new MeshLlm() : new PreviewLlm(),
    emit: (type, payload) => emit(task, type as RavanaEventType, payload),
    signal: controller.signal,
  });
  task.verification = verification;
  const nodeFailures = task.plan.filter((n) => n.status === "failed");
  const hasNodeFailures = nodeFailures.length > 0;
  const status: RavanaTaskStatus = hasNodeFailures || verification.status === "failed" ? "failed" : "completed";
  task.status = status;
  task.finishedAt = Date.now();
  const files = collectFiles(task);
  task.result = {
    type: task.kind === "coding" ? "code" : task.kind === "build" ? "result" : "answer",
    content: deliverable.slice(0, 60_000),
    ...(Object.keys(files).length ? { files } : {}),
    ...(task.plan.length > 1 ? { plan: task.plan } : {}),
  };
  if (status === "failed" && !hasNodeFailures) {
    task.error = verification.findings.map((f) => `${f.severity}: ${f.text}`).slice(0, 4).join(" | ").slice(0, 700);
  }
  emit(task, "verification.completed", { scope: "final", status: verification.status, score: verification.score, strategy: verification.strategy, findings: verification.findings.length });
  emit(task, "task.completed", { status: task.status, kind: task.kind, engine, modelCalls: task.used.modelCalls, steps: task.used.steps, verification: verification.status });
  await saveTask(task, true);
}

function trimPlan(nodes: RavanaPlanNode[], maxNodes: number): RavanaPlanNode[] {
  if (nodes.length <= maxNodes) return nodes;
  const kept = nodes.slice(0, maxNodes);
  const ids = new Set(kept.map((n) => n.id));
  for (const n of kept) n.dependencies = n.dependencies.filter((d) => ids.has(d));
  return kept;
}

/** Plan-level recovery: supersede failed nodes with revised copies; dependents follow the copy. */
function revisePlan(task: RavanaTask): void {
  const failed = task.plan.filter((n) => n.status === "failed");
  const revisions: { failed: RavanaPlanNode; node: RavanaPlanNode }[] = [];
  for (const f of failed) {
    const node: RavanaPlanNode = {
      id: `task_${String(task.plan.length + revisions.length + 1).padStart(3, "0")}`,
      description: `Revised: ${f.description}`,
      type: f.type,
      priority: f.priority,
      dependencies: [...f.dependencies],
      tools: [...f.tools],
      status: "pending",
      attempts: 0,
    };
    revisions.push({ failed: f, node });
  }
  for (const n of task.plan) {
    for (const r of revisions) {
      const i = n.dependencies.indexOf(r.failed.id);
      if (i !== -1) n.dependencies[i] = r.node.id;
    }
  }
  task.plan.push(...revisions.map((r) => r.node));
  for (const r of revisions) {
    r.failed.status = "skipped";
    r.failed.note = `superseded by ${r.node.id} during replan`;
    r.failed.output = undefined;
  }
}

async function executeNode(ctx: ExecContext, node: RavanaPlanNode, controller: AbortController): Promise<void> {
  const task = ctx.task;
  node.status = "running";
  node.attempts += 1;
  task.used.steps += 1;
  emit(task, "note", { node: node.id, attempt: node.attempts, step: node.description.slice(0, 160) });
  await saveTask(task);
  let files: Record<string, string> = {};
  let output = "";
  let fixHint: string | undefined;
  for (let attempt = 1; attempt <= MAX_NODE_ATTEMPTS; attempt++) {
    try {
      const outcome = await execNode(ctx, node, attempt > 1 ? fixHint : undefined);
      files = outcome.files ?? {};
      output = outcome.output ?? "";
      if (!outcome.ok) throw new ExecutorError(outcome.note ?? "node execution failed");
      if (node.type === "code") memoryStores.workingSet(task.id, `files:${node.id}`, files);
      memoryStores.workingSet(task.id, `output:${node.id}`, output.slice(0, 6000));
      emit(task, "verification.started", { node: node.id, strategy: node.type === "code" ? "tests" : "structural" });
      const { verification, fixHint: hint } = await checkNode(node, { output, files }, { tools: ctx.tools, signal: controller.signal, preview: ctx.tools.preview });
      if (verification.status === "failed" && verification.strategy === "tests") {
        fixHint = hint;
        emit(task, "note", { node: node.id, attempt, note: `tests failed — ${verification.findings[0]?.text?.slice(0, 300) ?? "see tool output"}` });
        continue;
      }
      const structuralPass = verification.status === "passed" || (verification.status === "failed" && (node.type === "research" || node.type === "understand"));
      node.status = structuralPass ? "passed" : "failed";
      node.output = (output ?? "").slice(0, 8000);
      node.note = outcome.note ?? node.note;
      node.verify = verification.strategy;
      emit(task, "verification.completed", { node: node.id, status: verification.status, strategy: verification.strategy, attempts: attempt });
      emit(task, node.status === "passed" ? "node.passed" : "node.failed", { node: node.id });
      return;
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      fixHint = err.slice(0, 1400);
      if (attempt < MAX_NODE_ATTEMPTS) {
        emit(task, "note", { node: node.id, attempt, note: `retry — ${err.slice(0, 240)}` });
        await new Promise((r) => setTimeout(r, 200));
        continue;
      }
    }
  }
  node.status = "failed";
  node.output = (output ?? "").slice(0, 4000);
  emit(task, "node.failed", { node: node.id, attempts: node.attempts });
}

// ------------------------------------------------------------ tools + permissions

/**
 * Tool gate: LLM → tool request → policy engine → permission check → sandbox → result.
 * Confirmation-gated tools pause the task (awaiting_confirmation) and resume on approval.
 */
async function gateTool(task: RavanaTask, principal: Principal, name: string, args: Record<string, unknown>, controller: AbortController, purpose?: string): Promise<ToolResult> {
  const rt = await loadTool(name);
  const fail = (summary: string, error: string): ToolResult => ({ ok: false, summary, error, ms: 0 });
  if (!rt) return fail(`tool ${name} not found`, "unknown tool");
  const capabilityId = toolCapabilityId(rt.name);
  const requested = authorize({ principal, capabilityId, required: rt.permission, requiresConfirmation: rt.requiresConfirmation, args });
  if (requested.allow) {
    emit(task, "tool.requested", { tool: rt.name, allowed: true, permission: rt.permission, purpose });
  } else if (requested.code === "needs_confirmation" || (requested.code === "insufficient_level" && rt.permission === "full_workspace" && rt.requiresConfirmation)) {
    const token = issueConfirmation(principal.uid, capabilityId, 10 * 60_000);
    task.pendingTool = { name: rt.name, args: { ...args }, capabilityId, required: rt.permission, reason: requested.reason, token };
    task.status = "awaiting_confirmation";
    emit(task, "tool.requested", { tool: rt.name, permission: rt.permission, reason: requested.reason, purpose, confirmation_token: token });
    emit(task, "task.awaiting_confirmation", { tool: rt.name, reason: requested.reason });
    await saveTask(task, true);
    const approved = await waitForConfirmation(task.id, controller);
    if (!approved) {
      task.pendingTool = null;
      if (task.status === "awaiting_confirmation") task.status = "running";
      return fail(`tool ${rt.name} was not approved`, "not approved");
    }
    // confirmToolRequest already consumed + validated the token.
  } else {
    emit(task, "tool.requested", { tool: rt.name, allowed: false, reason: requested.reason, purpose });
    return fail(`tool ${rt.name} denied by policy`, requested.reason);
  }

  emit(task, "tool.started", { tool: rt.name, purpose });
  try {
    const res = await rt.run({ uid: task.uid, taskId: task.id, projectId: task.projectId, signal: controller.signal }, args);
    emit(task, "tool.completed", { tool: rt.name, ok: res.ok, ms: res.ms, summary: res.summary.slice(0, 220), purpose });
    return res;
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    emit(task, "tool.completed", { tool: rt.name, ok: false, error: err.slice(0, 300), purpose });
    return fail(`tool ${rt.name} crashed`, err);
  }
}

async function loadTool(name: string): Promise<RavanaToolRuntime | undefined> {
  bootTools();
  const { tool, resolveToolName } = await import("./tools/registry");
  return tool(resolveToolName(name));
}

function waitForConfirmation(id: string, controller: AbortController): Promise<boolean> {
  return new Promise((resolve) => {
    const entry = { resolve: (d: { approved: boolean }) => resolve(d.approved) };
    waits.set(id, entry);
    const onAbort = () => {
      waits.delete(id);
      entry.resolve({ approved: false });
    };
    controller.signal.addEventListener("abort", onAbort, { once: true });
  });
}

// ------------------------------------------------------------ synthesis + summary

/** Deterministic synthesis from the plan (no hidden reasoning; code artifacts attached). */
function composeDeliverable(task: RavanaTask): string {
  if (!task.plan.length) return "No plan was produced for this task.";
  const lastContent = [...task.plan].reverse().find((n) => (n.status === "passed" || n.status === "skipped") && n.type === "synthesize");
  const lastReason = [...task.plan].reverse().find((n) => n.status === "passed" && (n.type === "reason" || n.type === "synthesize"));
  const head = lastReason?.output?.trim() ?? (lastContent?.status === "skipped" ? lastContent.note ?? "" : "");
  if (!head) {
    const passed = task.plan.filter((n) => n.status === "passed" && n.output?.trim());
    const joined = passed.map((n) => `## ${n.description}\n${n.output}`).join("\n\n");
    return joined.slice(0, 16_000) || "No output captured — the plan did not complete any step.";
  }
  const files = collectFiles(task);
  const filesBlock = Object.keys(files).length
    ? `\n\n## Artifacts\n\n` + Object.entries(files).map(([name, body]) => `**${name}**\n\`\`\`\n${body.slice(0, 30_000)}\n\`\`\``).join("\n\n")
    : "";
  return head.slice(0, 24_000) + filesBlock;
}

function collectFiles(task: RavanaTask): Record<string, string> {
  const files: Record<string, string> = {};
  let size = 0;
  for (const n of task.plan) {
    const f = memoryStores.workingGet(task.id, `files:${n.id}`) as Record<string, string> | undefined;
    if (!f) continue;
    for (const [name, body] of Object.entries(f)) {
      if (files[name]) continue;
      if (size + body.length > 240_000) continue;
      files[name] = body;
      size += body.length;
    }
  }
  return files;
}

function composePartial(task: RavanaTask): void {
  const content = composeDeliverable(task);
  task.result = { type: "result", content: `RAVANA could not complete this task.\n\n${task.error ?? ""}\n\n---\n\n${content.slice(0, 40_000)}` };
}

function finalizeSummary(task: RavanaTask): void {
  if (task.summary && task.summary.modelsUsed.length) return; // already built after completion
  const models = new Map<string, RavanaModelUse>();
  const toolsUsed = new Map<string, RavanaToolUse>();
  for (const e of task.events) {
    if (e.type === "model.selected" && e.payload?.provider && e.payload?.model) {
      const k = `${e.payload.provider}/${e.payload.model}`;
      const m = models.get(k) ?? {
        role: String(e.payload.role ?? "reasoning") as RavanaModelUse["role"],
        provider: String(e.payload.provider),
        model: String(e.payload.model),
        calls: 0,
      };
      m.calls++;
      models.set(k, m);
    }
    if (e.type === "tool.completed" && e.payload?.tool) {
      const k = String(e.payload.tool);
      const t = toolsUsed.get(k) ?? { name: k, calls: 0, ok: 0, failed: 0 };
      t.calls++;
      if (e.payload.ok === true) t.ok++;
      else if (e.payload.ok === false) t.failed++;
      toolsUsed.set(k, t);
    }
  }
  task.summary = {
    engine: task.engineResolved ?? "auto",
    engineLabel: task.engineResolved === "preview" ? "Preview responder — deterministic demo, no model calls" : "Aetheris model mesh with role routing",
    modelsUsed: [...models.values()],
    toolsUsed: [...toolsUsed.values()],
    steps: task.used.steps,
    startedAt: task.startedAt,
    finishedAt: task.finishedAt,
    ms: task.startedAt && task.finishedAt ? task.finishedAt - task.startedAt : undefined,
    replans: task.summary?.replans ?? 0,
  };
}

async function finishMemory(task: RavanaTask): Promise<void> {
  try {
    if (task.status === "completed" || task.status === "failed") {
      const preview = task.engineResolved === "preview";
      const ep = await rememberEpisode(
        task.uid,
        "ravana_task",
        task.id,
        task.status === "completed" ? `completed (${task.kind}, verification ${task.verification?.status ?? "n/a"})` : `failed: ${(task.error ?? "").slice(0, 300)}`,
        task.error ? task.error.slice(0, 400) : null,
        task.result?.files ? `artifact files: ${Object.keys(task.result.files).join(", ")}` : null,
        {
          projectId: task.projectId,
          taskId: task.id,
          importance: preview ? 0.2 : task.status === "completed" ? 0.35 : 0.55,
          tags: preview ? ["preview", task.kind] : [task.kind],
          meta: { engine: task.engineResolved ?? "auto", kind: task.kind, verification: task.verification?.status },
        },
      );
      if (ep) emit(task, "memory.saved", { type: "episodic", id: ep.id });
    }
    memoryStores.sessionPush(`ravana:${task.uid}`, `${task.status}: ${task.title}`, "task");
  } catch {
    // memory must never break the run
  }
  memoryStores.workingClear(task.id);
}

// ------------------------------------------------------------ status / manifest

async function resolveEngine(engine: RavanaEngine): Promise<"mesh" | "preview"> {
  if (engine === "preview") return "preview";
  if (engine === "mesh") return "mesh";
  const { selectCandidates } = await import("./routing/model_router");
  return selectCandidates("fast").primary ? "mesh" : "preview";
}

export async function engineManifest(uid: string) {
  bootTools();
  const { toolStatus } = await import("./tools/registry");
  return {
    core: "ravana",
    version: "0.1.0",
    status: "ONLINE",
    subsystems: {
      perception: { name: "Intent analyzer + task classifier", status: "implemented", note: "deterministic rule classifier — no model call" },
      planning: { name: "Planning engine (DAG task graph)", status: "implemented", note: "model-drafted graphs on deep tasks; canonical templates otherwise" },
      routing: { name: "Model router", status: "implemented", note: "roles fast/reasoning/coding/vision over the Aetheris mesh; RAVANA_MODEL_<ROLE> overrides" },
      tools: { name: "Tool system + capability policy", status: "implemented", note: `${toolStatus().length} built-in tools behind the permission layer` },
      execution: { name: "Agent loop", status: "implemented", note: "wave scheduler, per-node verify→correct, plan-level replan" },
      verification: { name: "Verifier", status: "implemented", note: "tests · structural · selfcheck · independent review (spec §9)" },
      memory: { name: "Memory hierarchy", status: "implemented", note: "working/session in-process; episodic/semantic persisted; layered retrieval + rerank" },
    },
    engine: await resolveEngine("auto"),
    tools: toolStatus().length,
    uid,
    api: "/api/v1/ravana",
  };
}
