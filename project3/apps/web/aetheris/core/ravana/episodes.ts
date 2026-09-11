/**
 * RAVANA Episode Ledger.
 *
 *   A read-side composer over finished RAVANA tasks. Every episode is a
 *   real task the engine ran for this uid — completed, failed, cancelled
 *   or timed out. Nothing is invented: the ledger reads what
 *   `listTasks` already stores and projects it into a stable,
 *   export-friendly shape.
 *
 *   Why it exists:
 *     - Operator surface: "what did RAVANA actually do for me?"
 *     - Audit: every episode carries the execution-trace event types,
 *       verification status, models/tools used, and duration.
 *     - Future Phase-6 path: the same records are the seed for
 *       training-dataset generation (RAVANA-Bench). This module does
 *       NOT claim a benchmark; it only exports what ran.
 *
 *   Honest scope:
 *     - Does not invent accuracy, quality scores, or "lessons learned"
 *       beyond what the task record already holds.
 *     - Does not include live/running tasks — only terminal statuses.
 *     - Does not cross uid boundaries.
 *     - Export is a rendering of the same data; no transformation that
 *       would change meaning.
 */

import { listTasks, getTask } from "./engine";
import type {
  RavanaEvent,
  RavanaEventType,
  RavanaExecutionSummary,
  RavanaKind,
  RavanaPlanNode,
  RavanaResult,
  RavanaTask,
  RavanaTaskStatus,
  RavanaVerification,
} from "./types";

/** Terminal statuses that qualify a task as an "episode". */
export const EPISODE_STATUSES: readonly RavanaTaskStatus[] = [
  "completed",
  "failed",
  "cancelled",
  "timeout",
] as const;

const TERMINAL = new Set<RavanaTaskStatus>(EPISODE_STATUSES);

export interface EpisodeNodeSummary {
  id: string;
  type: string;
  status: string;
  attempts: number;
  description: string;
  tools: string[];
}

export interface EpisodeEventSummary {
  seq: number;
  at: number;
  type: RavanaEventType;
  /** Flattened, UI-safe one-line summary of the payload (never chain-of-thought). */
  summary: string;
}

export interface Episode {
  /** Same as the underlying RAVANA task id (rvn_…). */
  id: string;
  uid: string;
  projectId: string | null;
  title: string;
  objective: string;
  kind: RavanaKind;
  kindReason: string;
  status: RavanaTaskStatus;
  engine: string;
  engineResolved: "mesh" | "preview" | null;
  /** Wall-clock duration in ms (finishedAt − startedAt), or null if either is missing. */
  durationMs: number | null;
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
  /** Plan node rollup. */
  nodes: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    pending: number;
  };
  /** Event rollup by type. */
  eventCounts: Record<string, number>;
  eventTotal: number;
  verification: {
    strategy: string;
    status: string;
    score: number | null;
    independent: boolean | null;
    findings: number;
  } | null;
  modelsUsed: { role: string; provider: string; model: string; calls: number }[];
  toolsUsed: { name: string; calls: number; ok: number; failed: number }[];
  replans: number;
  /** Truncated result content for list views (full content only in detail). */
  resultPreview: string | null;
  resultType: string | null;
  error: string | null;
}

export interface EpisodeDetail extends Episode {
  /** Full plan nodes (no chain-of-thought; only the stored fields). */
  plan: EpisodeNodeSummary[];
  /** Chronological execution-trace events. */
  timeline: EpisodeEventSummary[];
  /** Full verification record if present. */
  verificationFull: RavanaVerification | null;
  /** Full result (content + file names only — file bodies capped). */
  result: {
    type: string;
    content: string;
    files: string[];
  } | null;
  summary: RavanaExecutionSummary | null;
}

export interface EpisodeList {
  uid: string;
  total: number;
  episodes: Episode[];
  /** Aggregate stats over the returned set (not the whole store if filtered). */
  stats: EpisodeStats;
  generatedAt: number;
  /** Honest boundary note. */
  notes: {
    proves: string;
    doesNotProve: string;
  };
}

export interface EpisodeStats {
  byStatus: Record<string, number>;
  byKind: Record<string, number>;
  byEngine: Record<string, number>;
  completed: number;
  failed: number;
  successRate: number | null;
  avgDurationMs: number | null;
  totalModelCalls: number;
  totalToolCalls: number;
  verifiedPassed: number;
  verifiedFailed: number;
}

export interface EpisodeListOpts {
  /** Cap on returned episodes (newest first). Default 50, max 200. */
  limit?: number;
  /** Filter by terminal status. */
  status?: RavanaTaskStatus[];
  /** Filter by kind. */
  kind?: RavanaKind[];
  /** Only episodes finished at or after this unix-ms. */
  sinceMs?: number;
  /** Restrict to one project. */
  projectId?: string | null;
}

const NOTES = {
  proves:
    "These episodes are finished RAVANA tasks for this uid. Each row is grounded in a stored task record (plan, events, verification, models, tools, duration).",
  doesNotProve:
    "The ledger does not invent accuracy, quality scores, or training-set labels. Exporting episodes is not a RAVANA-Bench run. Live/running tasks are excluded.",
};

function eventSummary(e: RavanaEvent): string {
  const p = e.payload ?? {};
  const bits: string[] = [];
  for (const k of ["engine", "role", "provider", "model", "name", "nodeId", "status", "reason", "ok", "ms", "count", "label"]) {
    if (p[k] !== undefined && p[k] !== null && p[k] !== "") bits.push(`${k}=${String(p[k]).slice(0, 80)}`);
  }
  if (bits.length === 0 && typeof p.detail === "string") bits.push(p.detail.slice(0, 120));
  if (bits.length === 0 && typeof p.message === "string") bits.push(p.message.slice(0, 120));
  return bits.join(" · ") || e.type;
}

function nodeRollup(plan: RavanaPlanNode[]): Episode["nodes"] {
  const out = { total: plan.length, passed: 0, failed: 0, skipped: 0, pending: 0 };
  for (const n of plan) {
    if (n.status === "passed") out.passed++;
    else if (n.status === "failed") out.failed++;
    else if (n.status === "skipped") out.skipped++;
    else out.pending++;
  }
  return out;
}

function eventCounts(events: RavanaEvent[]): Record<string, number> {
  const c: Record<string, number> = {};
  for (const e of events) c[e.type] = (c[e.type] ?? 0) + 1;
  return c;
}

function durationOf(t: RavanaTask): number | null {
  if (t.finishedAt && t.startedAt && t.finishedAt >= t.startedAt) return t.finishedAt - t.startedAt;
  if (t.summary?.ms !== undefined && Number.isFinite(t.summary.ms)) return t.summary.ms;
  return null;
}

/** Project a stored task into a list-row episode. Pure. */
export function toEpisode(t: RavanaTask): Episode {
  const ver = t.verification;
  return {
    id: t.id,
    uid: t.uid,
    projectId: t.projectId ?? null,
    title: t.title,
    objective: t.objective,
    kind: t.kind,
    kindReason: t.kindReason,
    status: t.status,
    engine: t.engine,
    engineResolved: t.engineResolved ?? null,
    durationMs: durationOf(t),
    createdAt: t.createdAt,
    startedAt: t.startedAt ?? null,
    finishedAt: t.finishedAt ?? null,
    nodes: nodeRollup(t.plan),
    eventCounts: eventCounts(t.events),
    eventTotal: t.events.length,
    verification: ver
      ? {
          strategy: ver.strategy,
          status: ver.status,
          score: ver.score ?? null,
          independent: ver.independent ?? null,
          findings: ver.findings?.length ?? 0,
        }
      : null,
    modelsUsed: (t.summary?.modelsUsed ?? []).map((m) => ({
      role: m.role,
      provider: m.provider,
      model: m.model,
      calls: m.calls,
    })),
    toolsUsed: (t.summary?.toolsUsed ?? []).map((u) => ({
      name: u.name,
      calls: u.calls,
      ok: u.ok,
      failed: u.failed,
    })),
    replans: t.summary?.replans ?? 0,
    resultPreview: t.result?.content ? t.result.content.slice(0, 240) : null,
    resultType: t.result?.type ?? null,
    error: t.error ?? null,
  };
}

/** Project a stored task into a detail episode (includes timeline + plan). Pure. */
export function toEpisodeDetail(t: RavanaTask): EpisodeDetail {
  const base = toEpisode(t);
  const timeline = [...t.events]
    .sort((a, b) => a.seq - b.seq || a.at - b.at)
    .map((e) => ({ seq: e.seq, at: e.at, type: e.type, summary: eventSummary(e) }));
  const plan: EpisodeNodeSummary[] = t.plan.map((n) => ({
    id: n.id,
    type: n.type,
    status: n.status,
    attempts: n.attempts,
    description: n.description,
    tools: n.tools,
  }));
  let result: EpisodeDetail["result"] = null;
  if (t.result) {
    result = {
      type: t.result.type,
      content: t.result.content.slice(0, 8_000),
      files: Object.keys(t.result.files ?? {}).slice(0, 40),
    };
  }
  return {
    ...base,
    plan,
    timeline,
    verificationFull: t.verification ?? null,
    result,
    summary: t.summary ?? null,
  };
}

/** Aggregate stats over a set of episodes. Pure. */
export function computeStats(episodes: Episode[]): EpisodeStats {
  const byStatus: Record<string, number> = {};
  const byKind: Record<string, number> = {};
  const byEngine: Record<string, number> = {};
  let completed = 0;
  let failed = 0;
  let durSum = 0;
  let durN = 0;
  let totalModelCalls = 0;
  let totalToolCalls = 0;
  let verifiedPassed = 0;
  let verifiedFailed = 0;

  for (const e of episodes) {
    byStatus[e.status] = (byStatus[e.status] ?? 0) + 1;
    byKind[e.kind] = (byKind[e.kind] ?? 0) + 1;
    const eng = e.engineResolved ?? e.engine;
    byEngine[eng] = (byEngine[eng] ?? 0) + 1;
    if (e.status === "completed") completed++;
    if (e.status === "failed" || e.status === "timeout") failed++;
    if (e.durationMs !== null) {
      durSum += e.durationMs;
      durN++;
    }
    for (const m of e.modelsUsed) totalModelCalls += m.calls;
    for (const t of e.toolsUsed) totalToolCalls += t.calls;
    if (e.verification) {
      if (e.verification.status === "passed" || e.verification.status === "passed_with_warnings") verifiedPassed++;
      if (e.verification.status === "failed") verifiedFailed++;
    }
  }

  const decided = completed + failed;
  return {
    byStatus,
    byKind,
    byEngine,
    completed,
    failed,
    successRate: decided > 0 ? completed / decided : null,
    avgDurationMs: durN > 0 ? Math.round(durSum / durN) : null,
    totalModelCalls,
    totalToolCalls,
    verifiedPassed,
    verifiedFailed,
  };
}

function isTerminal(t: RavanaTask): boolean {
  return TERMINAL.has(t.status);
}

/**
 * List episodes for a uid. Newest-finished first (falls back to createdAt).
 * Cross-uid isolation is enforced by `listTasks`.
 */
export async function listEpisodes(uid: string, opts: EpisodeListOpts = {}): Promise<EpisodeList> {
  const limit = Math.min(Math.max(1, opts.limit ?? 50), 200);
  // Pull a wider window so status/kind/since filters still fill `limit`.
  const raw = await listTasks(uid, {
    status: opts.status?.length ? opts.status : [...EPISODE_STATUSES],
    projectId: opts.projectId,
    limit: 500,
  });

  let filtered = raw.filter(isTerminal);
  if (opts.kind?.length) {
    const want = new Set(opts.kind);
    filtered = filtered.filter((t) => want.has(t.kind));
  }
  if (opts.sinceMs !== undefined) {
    filtered = filtered.filter((t) => (t.finishedAt ?? t.createdAt) >= opts.sinceMs!);
  }

  filtered.sort((a, b) => (b.finishedAt ?? b.createdAt) - (a.finishedAt ?? a.createdAt));
  const sliced = filtered.slice(0, limit);
  const episodes = sliced.map(toEpisode);
  return {
    uid,
    total: episodes.length,
    episodes,
    stats: computeStats(episodes),
    generatedAt: Date.now(),
    notes: { ...NOTES },
  };
}

/**
 * Fetch one episode by id. Returns null if missing or not owned by uid,
 * or if the task is not yet terminal (still running / queued).
 */
export async function getEpisode(uid: string, id: string): Promise<EpisodeDetail | null> {
  const t = await getTask(id);
  if (!t || t.uid !== uid) return null;
  if (!isTerminal(t)) return null;
  return toEpisodeDetail(t);
}

// ---------------------------------------------------------------------------
// Export (JSON / CSV) — same data, different rendering. No fabrication.
// ---------------------------------------------------------------------------

export interface EpisodeExportJson {
  format: "json";
  uid: string;
  total: number;
  episodes: Episode[];
  stats: EpisodeStats;
  notes: { proves: string; doesNotProve: string };
  exportedAt: number;
}

export interface EpisodeExportCsv {
  format: "csv";
  uid: string;
  total: number;
  headers: string[];
  rows: string[][];
  notes: { proves: string; doesNotProve: string };
  exportedAt: number;
}

export type EpisodeExport = EpisodeExportJson | EpisodeExportCsv;

const CSV_HEADERS = [
  "id",
  "title",
  "kind",
  "status",
  "engine",
  "engineResolved",
  "createdAt",
  "finishedAt",
  "durationMs",
  "nodesTotal",
  "nodesPassed",
  "nodesFailed",
  "eventTotal",
  "verificationStatus",
  "verificationScore",
  "modelCalls",
  "toolCalls",
  "replans",
  "error",
];

function csvCell(s: string): string {
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function exportEpisodesJson(uid: string, opts: EpisodeListOpts = {}): Promise<EpisodeExportJson> {
  const list = await listEpisodes(uid, opts);
  return {
    format: "json",
    uid,
    total: list.total,
    episodes: list.episodes,
    stats: list.stats,
    notes: list.notes,
    exportedAt: Date.now(),
  };
}

export async function exportEpisodesCsv(uid: string, opts: EpisodeListOpts = {}): Promise<EpisodeExportCsv> {
  const list = await listEpisodes(uid, opts);
  const rows = list.episodes.map((e) => {
    const modelCalls = e.modelsUsed.reduce((s, m) => s + m.calls, 0);
    const toolCalls = e.toolsUsed.reduce((s, t) => s + t.calls, 0);
    return [
      e.id,
      e.title,
      e.kind,
      e.status,
      e.engine,
      e.engineResolved ?? "",
      String(e.createdAt),
      e.finishedAt === null ? "" : String(e.finishedAt),
      e.durationMs === null ? "" : String(e.durationMs),
      String(e.nodes.total),
      String(e.nodes.passed),
      String(e.nodes.failed),
      String(e.eventTotal),
      e.verification?.status ?? "",
      e.verification?.score === null || e.verification?.score === undefined ? "" : String(e.verification.score),
      String(modelCalls),
      String(toolCalls),
      String(e.replans),
      e.error ?? "",
    ];
  });
  return {
    format: "csv",
    uid,
    total: list.total,
    headers: CSV_HEADERS,
    rows,
    notes: list.notes,
    exportedAt: Date.now(),
  };
}

export function toCsvString(c: EpisodeExportCsv): string {
  const lines = [c.headers.map(csvCell).join(",")];
  for (const r of c.rows) lines.push(r.map(csvCell).join(","));
  // Trail with the honest boundary so a spreadsheet still carries it.
  lines.push(`# proves: ${c.notes.proves}`);
  lines.push(`# doesNotProve: ${c.notes.doesNotProve}`);
  return lines.join("\n") + "\n";
}

/** Re-export result type so callers don't need the full RavanaResult. */
export type { RavanaResult };
