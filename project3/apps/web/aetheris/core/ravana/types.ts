/**
 * RAVANA — Aetheris Core #1 (Reasoning Core).
 *
 * Shared type model. RAVANA is an intelligence layer above models: it classifies the task,
 * builds a DAG plan, routes each node to a model role + tools, executes an observe/verify/correct
 * loop, and streams execution-trace events (never hidden chain-of-thought) through a stable API.
 *
 * Storage mapping (JSON store under data/, single-instance; swap point = StorageProvider):
 *   ravana_projects  → projects            ravana_tasks  → tasks + events + plan
 *   ravana_memories  → episodic/semantic   in-process    → working + session memory
 *
 * Status vocabulary follows the repository rule: IMPLEMENTED · PARTIAL · EXPERIMENTAL · MOCKED ·
 * NOT AVAILABLE. Nothing in RAVANA v0.1 is MOCKED; the "preview" responder is a clearly-labelled,
 * deterministic demo engine used when no model provider is reachable (see models/preview.ts).
 */

/** Task classification produced by the Intent Analyzer / Task Classifier (deterministic). */
export type RavanaKind =
  | "chat"        // quick definition, casual Q&A → fast model, shallow plan
  | "analysis"    // understand/explain/reason over supplied context → reasoning model
  | "research"    // needs evidence gathering (web/notes) before an answer
  | "coding"      // generate/fix/explain code → coding model + sandbox verification
  | "math"        // symbolic/numeric problem → solve + independent verify
  | "vision"      // image(s) present → vision-capable provider
  | "build"       // long multi-step objective → deep DAG planning + tools

/** Node types inside a RAVANA plan (spec §7 — task graph). */
export type RavanaNodeType =
  | "understand"
  | "research"
  | "reason"
  | "code"
  | "verify"
  | "synthesize";

/** Model roles RAVANA routes to (spec §4.1 — never one model). */
export type RavanaRole = "fast" | "reasoning" | "coding" | "vision";

/** Engine that executes model calls. preview = deterministic demo responder (no model call). */
export type RavanaEngine = "auto" | "mesh" | "preview";

export type RavanaTaskStatus =
  | "queued"
  | "planning"
  | "running"
  | "awaiting_confirmation"
  | "completed"
  | "failed"
  | "cancelled"
  | "timeout";

export type RavanaNodeStatus = "pending" | "running" | "passed" | "failed" | "skipped";

export type RavanaPriority = "low" | "normal" | "high";

export interface RavanaPlanNode {
  /** Stable id inside the task graph, e.g. "task_002" (spec §7). */
  id: string;
  description: string;
  type: RavanaNodeType;
  priority: RavanaPriority;
  /** Ids of nodes that must pass before this one runs (DAG edges). */
  dependencies: string[];
  /** Tool names the executor may use for this node (unified tool protocol ids). */
  tools: string[];
  status: RavanaNodeStatus;
  /** Number of execution attempts so far (recovery may retry). */
  attempts: number;
  /** Traceable summary of what the node produced (execution trace, not chain-of-thought). */
  output?: string;
  note?: string;
  /** Verification strategy chosen for this node. */
  verify?: RavanaVerifyStrategy;
}

/** Streaming events (spec §16). Event type names stay stable — the API contract is frozen. */
export type RavanaEventType =
  | "task.created"
  | "engine.selected"
  | "task.planned"
  | "task.started"
  | "model.selected"
  | "tool.requested"
  | "tool.started"
  | "tool.completed"
  | "memory.retrieved"
  | "memory.saved"
  | "reasoning.completed"
  | "verification.started"
  | "verification.completed"
  | "task.replanned"
  | "task.awaiting_confirmation"
  | "task.resumed"
  | "node.passed"
  | "node.failed"
  | "task.completed"
  | "task.failed"
  | "task.cancelled"
  | "note";

export interface RavanaEvent {
  seq: number;
  at: number;
  type: RavanaEventType;
  /** Small, UI-safe payload. Content never contains hidden chain-of-thought. */
  payload?: Record<string, unknown>;
}

export type RavanaVerifyStrategy = "none" | "selfcheck" | "independent_review" | "tests" | "structural";

export interface RavanaFinding {
  severity: "blocker" | "major" | "minor";
  text: string;
}

export interface RavanaVerification {
  strategy: RavanaVerifyStrategy;
  status: "passed" | "passed_with_warnings" | "failed" | "not_run";
  score?: number;
  findings: RavanaFinding[];
  attempts: number;
  /** Provider/model that generated vs reviewed — recorded so independence is checkable. */
  generator?: { provider?: string; model?: string } | null;
  reviewer?: { provider?: string; model?: string } | null;
  independent?: boolean;
  detail?: string;
}

export interface RavanaModelUse {
  role: RavanaRole;
  provider: string;
  model: string;
  calls: number;
}

export interface RavanaToolUse {
  name: string;
  calls: number;
  ok: number;
  failed: number;
}

export interface RavanaExecutionSummary {
  engine: RavanaEngine;
  /** Human explanation of which engine ran and why (honesty about preview mode). */
  engineLabel: string;
  modelsUsed: RavanaModelUse[];
  toolsUsed: RavanaToolUse[];
  steps: number;
  startedAt?: number;
  finishedAt?: number;
  ms?: number;
  replans: number;
}

export interface RavanaResult {
  /** answer | plan | code | action | result (spec §1 output). */
  type: "answer" | "plan" | "code" | "action" | "result";
  content: string;
  /** Code tasks: file → content, capped (artifacts). */
  files?: Record<string, string>;
  /** Structured outcome for plan/action tasks. */
  plan?: RavanaPlanNode[];
}

export interface RavanaBudget {
  maxModelCalls: number;
  maxChars: number;
  timeoutMs: number;
  maxNodes: number;
  verify: boolean;
}

export interface RavanaTask {
  id: string; // rvn_<base36>
  uid: string;
  projectId?: string | null;
  title: string;
  objective: string;
  /** Optional user context (paste, notes, repo description…). */
  context?: string;
  images?: string[];
  kind: RavanaKind;
  kindReason: string;
  priority: RavanaPriority;
  status: RavanaTaskStatus;
  engine: RavanaEngine;
  /** engine after auto-resolution (mesh vs preview). */
  engineResolved?: "mesh" | "preview";
  budget: RavanaBudget;
  used: { modelCalls: number; chars: number; steps: number };
  plan: RavanaPlanNode[];
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  events: RavanaEvent[]; // capped — the durable execution trace
  verification?: RavanaVerification;
  result?: RavanaResult;
  summary?: RavanaExecutionSummary;
  error?: string;
  /** Set when a tool request is waiting on a confirmation token. */
  pendingTool?: { name: string; args: Record<string, unknown>; capabilityId: string; required: string; reason: string; token?: string } | null;
  parentId?: string;
}

export interface RavanaProject {
  id: string;
  uid: string;
  name: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
  taskCount?: number;
}

export type RavanaMemoryType = "working" | "session" | "episodic" | "semantic";

export interface RavanaMemory {
  id: string;
  uid: string;
  projectId?: string | null;
  taskId?: string | null;
  type: RavanaMemoryType;
  content: string;
  /** tags used for metadata filtering (spec §11). */
  tags: string[];
  importance: number; // 0..1
  meta?: Record<string, unknown>;
  createdAt: number;
  source: string; // e.g. "engine" | "user" | "api"
}

/** One unified tool descriptor (spec §13). */
export interface RavanaTool {
  name: string;
  description: string;
  category: "memory" | "filesystem" | "execution" | "search" | "vision" | "system";
  /** JSON-schema-ish parameter hints for the UI/API. */
  schema: Record<string, unknown>;
  permission: "read_only" | "safe_write" | "full_workspace";
  requiresConfirmation: boolean;
  timeoutMs: number;
  sandboxed: boolean;
  status: "implemented" | "not_configured" | "experimental";
  note?: string;
}

export const RAVANA_EVENT_LABEL: Record<RavanaEventType, string> = {
  "task.created": "Task created",
  "engine.selected": "Engine selected",
  "task.planned": "Plan ready",
  "task.started": "Task started",
  "model.selected": "Model selected",
  "tool.requested": "Tool requested",
  "tool.started": "Tool started",
  "tool.completed": "Tool completed",
  "memory.retrieved": "Memory retrieved",
  "memory.saved": "Memory saved",
  "reasoning.completed": "Reasoning completed",
  "verification.started": "Verification started",
  "verification.completed": "Verification completed",
  "task.replanned": "Plan revised",
  "task.awaiting_confirmation": "Confirmation required",
  "task.resumed": "Task resumed",
  "node.passed": "Step passed",
  "node.failed": "Step failed",
  "task.completed": "Task completed",
  "task.failed": "Task failed",
  "task.cancelled": "Task cancelled",
  note: "Note",
};

/** Deterministic ranking (0..1) of task classification — exported for tests. */
export const KIND_LABEL: Record<RavanaKind, string> = {
  chat: "Quick question",
  analysis: "Analysis / explanation",
  research: "Research",
  coding: "Coding",
  math: "Mathematics",
  vision: "Vision",
  build: "Build / multi-step objective",
};

/** Small helper: kebab description of an engine for honest trace labels. */
export const ENGINE_LABEL: Record<"mesh" | "preview", string> = {
  mesh: "Model mesh — real provider calls, routed by role",
  preview: "Preview responder — deterministic demo, no model calls",
};
