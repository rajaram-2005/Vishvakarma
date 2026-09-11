/**
 * RAVANA · Memory stores (spec §10).
 *
 *   working   current task context (plan, tool results, observations) — in-process, destroyed
 *             with the task unless explicitly saved
 *   session   rolling context of one conversation session — in-process, TTL-bounded
 *   episodic  what happened (tasks run, tools used, what worked/failed)  → ravana_memories
 *   semantic  durable knowledge extracted during runs (facts w/ confidence) → ravana_memories
 *
 * Long-term stores are JSON collections behind the platform StorageProvider (swap point for
 * Postgres/SQLite per spec §20); provenance stamps every write; importance drives the reranker.
 */
import { randomBytes } from "node:crypto";
import { store } from "@/aetheris/lib/store";
import type { RavanaMemory, RavanaMemoryType } from "../types";

const COL = "ravana_memories";
/** process-local memory (honest: not persisted across restarts). */
const session = new Map<string, { at: number; content: string }[]>();
const working = new Map<string, Map<string, unknown>>();

const SESSION_TTL = 6 * 60 * 60_000; // 6h
const SESSION_LIMIT = 60;
const WORKING_LIMIT = 300;

// ---------------------------------------------------------------- long-term (persisted)

export async function saveMemory(m: Omit<RavanaMemory, "id" | "createdAt">): Promise<RavanaMemory> {
  const rec: RavanaMemory = {
    id: "rvm_" + randomBytes(5).toString("hex"),
    createdAt: Date.now(),
    ...m,
    content: m.content.trim().slice(0, 4000),
  };
  if (rec.content.length < 2) return rec;
  // Light dedupe on exact content within the same (uid, project, type).
  const all = Object.values(await store.all<RavanaMemory>(COL));
  const dup = all.find((x) => x.uid === rec.uid && x.projectId === rec.projectId && x.type === rec.type && x.content === rec.content);
  if (dup) return dup;
  await store.set(COL, rec.id, rec);
  return rec;
}

export async function getMemory(id: string) {
  return store.get<RavanaMemory>(COL, id);
}

export async function deleteMemory(id: string) {
  await store.remove(COL, id);
}

export async function listMemories(uid: string, opts: { type?: RavanaMemoryType; projectId?: string | null; limit?: number } = {}): Promise<RavanaMemory[]> {
  const all = Object.values(await store.all<RavanaMemory>(COL));
  return all
    .filter((m) => m.uid === uid && (!opts.type || m.type === opts.type) && (opts.projectId === undefined || (m.projectId ?? null) === opts.projectId))
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, opts.limit ?? 100);
}

export async function memoryCounts(uid: string): Promise<Record<RavanaMemoryType, number>> {
  const all = Object.values(await store.all<RavanaMemory>(COL)).filter((m) => m.uid === uid);
  const out: Record<RavanaMemoryType, number> = { working: 0, session: 0, episodic: 0, semantic: 0 };
  for (const m of all) out[m.type] = (out[m.type] ?? 0) + 1;
  return out;
}

// ---------------------------------------------------------------- working + session

export function workingSet(taskId: string, key: string, value: unknown) {
  let m = working.get(taskId);
  if (!m) { m = new Map(); working.set(taskId, m); }
  if (m.size >= WORKING_LIMIT && !m.has(key)) m.delete(m.keys().next().value as string);
  m.set(key, value);
}

export function workingGet(taskId: string, key?: string): unknown {
  const m = working.get(taskId);
  if (!m) return key ? undefined : {};
  return key ? m.get(key) : Object.fromEntries(m);
}

export function workingDelete(taskId: string, key: string) {
  working.get(taskId)?.delete(key);
}

/** Drop all working memory for a task (spec: destroyed unless explicitly saved). */
export function workingClear(taskId: string) {
  working.delete(taskId);
}

export function sessionPush(key: string, content: string, role = "system") {
  const a = session.get(key) ?? [];
  a.push({ at: Date.now(), content: `${role}: ${content}`.slice(0, 2000) });
  session.set(key, a.slice(-SESSION_LIMIT));
}

export function sessionGet(key: string): string[] {
  const now = Date.now();
  const a = (session.get(key) ?? []).filter((x) => now - x.at < SESSION_TTL);
  if (a.length !== (session.get(key)?.length ?? 0)) session.set(key, a);
  return a.map((x) => x.content);
}

export function sessionClear(key: string) {
  session.delete(key);
}

export function memoryStatus() {
  return {
    persisted: { collection: COL },
    inProcess: { sessionSessions: session.size, workingTasks: working.size, sessionLimit: SESSION_LIMIT, workingLimit: WORKING_LIMIT },
  };
}
