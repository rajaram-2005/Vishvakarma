/**
 * RAVANA · Memory manager — the single entry point used by the engine and the public API.
 *
 * The engine writes what happened (episodic), what it learned (semantic) and keeps task context
 * in working memory; the API exposes save/search/list/delete plus the same retrieval pipeline so
 * future cores can query RAVANA memory over the frozen API (spec §15).
 */
import { randomBytes } from "node:crypto";
import { record } from "../../observability/events";
import type { RavanaMemory, RavanaMemoryType } from "../types";
import * as stores from "./stores";
import { searchMemories, type MemorySearchOptions, type RetrievedMemory } from "./retriever";

export interface SaveMemoryInput {
  uid: string;
  type: Exclude<RavanaMemoryType, "working" | "session">;
  content: string;
  projectId?: string | null;
  taskId?: string | null;
  tags?: string[];
  importance?: number;
  meta?: Record<string, unknown>;
  source?: string;
}

/** Save a durable memory (episodic = what happened; semantic = a fact with confidence). */
export async function saveMemory(input: SaveMemoryInput): Promise<RavanaMemory | null> {
  const clean = input.content.trim();
  if (clean.length < 3) return null;
  const rec = await stores.saveMemory({
    uid: input.uid,
    projectId: input.projectId ?? null,
    taskId: input.taskId ?? null,
    type: input.type,
    content: clean.slice(0, 3000),
    tags: [...new Set(["ravana", input.type, ...(input.tags ?? [])])].slice(0, 12),
    importance: Math.max(0, Math.min(1, input.importance ?? (input.type === "semantic" ? 0.6 : 0.4))),
    meta: input.meta ?? {},
    source: input.source ?? "api",
  });
  if (rec) record({ type: "memory", uid: input.uid, capability: `ravana:memory:${input.type}`, ok: true, detail: `${input.type}: ${clean.slice(0, 70)}` });
  return rec;
}

/** Engine sugar: remember an episode about a task run (spec §10 example shape). */
export async function rememberEpisode(
  uid: string,
  event: string,
  action: string,
  result: string,
  reason: string | null,
  solution: string | null,
  opts: { projectId?: string | null; taskId?: string; importance?: number; tags?: string[]; meta?: Record<string, unknown> } = {},
) {
  const lines = [`event: ${event}`, `action: ${action}`, `result: ${result}`];
  if (reason) lines.push(`reason: ${reason}`);
  if (solution) lines.push(`solution: ${solution}`);
  return saveMemory({
    uid,
    type: "episodic",
    content: lines.join("\n"),
    importance: opts.importance ?? (result === "failed" ? 0.55 : 0.3),
    source: "engine",
    meta: { event, action, result, ...opts.meta },
    tags: opts.tags,
    projectId: opts.projectId,
    taskId: opts.taskId,
  });
}

export type SearchInput = Omit<MemorySearchOptions, "uid" | "query"> & { query: string };

/** Public search over the retrieval pipeline (project metadata filter → rank → topK). */
export async function search(input: SearchInput & { uid: string }): Promise<RetrievedMemory[]> {
  const hits = await searchMemories({ ...input, types: input.types ?? ["episodic", "semantic"], includeLocal: false });
  return hits;
}

export async function list(uid: string, type?: RavanaMemoryType, projectId?: string | null, limit = 50) {
  return stores.listMemories(uid, { type, projectId: projectId === undefined ? undefined : projectId, limit });
}

export async function remove(uid: string, id: string): Promise<boolean> {
  const m = await stores.getMemory(id);
  if (!m || m.uid !== uid) return false;
  await stores.deleteMemory(id);
  return true;
}

export async function counts(uid: string) {
  return stores.memoryCounts(uid);
}

/** Generate a fresh project id. */
export function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${randomBytes(3).toString("hex")}`.slice(0, 24);
}

export { stores, searchMemories };
