/**
 * Typed Memory System (Phase 8) — server-side, per user, backed by the knowledge fabric.
 *
 *   short_term   the rolling context of one conversation/job (in-process ring, TTL)
 *   episodic     what happened (tasks run, outcomes, verdicts)                 → fabric, tag memory:episodic
 *   semantic     durable facts about the user / world / preferences            → fabric, tag memory:semantic
 *   procedural   how to do things: recipes, lessons, agent playbooks           → fabric, tag memory:procedural
 *   working      scratchpad shared by subagents of one job                     → in-process map keyed by job
 *
 * Every write is provenance-stamped; recall is hybrid (keyword+vector+graph) and can be time-scoped.
 * The existing client-side memory (localStorage) and agent lessons remain; this is the typed server layer
 * they can sync into. Status: IMPLEMENTED (semantic quality bounded by the fabric's embedding mode).
 */
import { addFact, deleteFact, listFacts, queryFacts, type Fact, type Hit, type SourceKind } from "../knowledge/fabric";
import { record } from "../observability/events";

export type MemoryType = "short_term" | "episodic" | "semantic" | "procedural" | "working";
export interface MemoryItem { id: string; type: MemoryType; text: string; at: number; tags: string[]; confidence: number; source: SourceKind; ref?: string; workspace: string }

const LIMITS: Record<MemoryType, number> = { short_term: 40, episodic: 2000, semantic: 1000, procedural: 500, working: 200 };
const shortTerm = new Map<string, { at: number; text: string; role: string }[]>();
const working = new Map<string, Map<string, unknown>>();
const TTL = 6 * 60 * 60_000;

const toItem = (f: Fact): MemoryItem => ({ id: f.id, type: (f.tags.find((t) => t.startsWith("memory:"))?.slice(7) as MemoryType) ?? "semantic", text: f.text, at: f.createdAt, tags: f.tags.filter((t) => !t.startsWith("memory:")), confidence: f.provenance.confidence, source: f.provenance.kind, ref: f.provenance.ref, workspace: f.workspace });

/** Remember something durable (episodic/semantic/procedural). Deduplicates near-identical text. */
export async function remember(uid: string, type: Exclude<MemoryType, "short_term" | "working">, text: string, opts: { workspace?: string; tags?: string[]; confidence?: number; source?: SourceKind; ref?: string; by?: string; supersedes?: string } = {}): Promise<MemoryItem | null> {
  const clean = text.trim(); if (clean.length < 3) return null;
  const dup = (await queryFacts(uid, clean, { workspace: opts.workspace, k: 3, tags: [`memory:${type}`], mode: "keyword" })).find((h) => h.fact.text.toLowerCase() === clean.toLowerCase());
  if (dup) return toItem(dup.fact);
  const existing = await listFacts(uid, opts.workspace, LIMITS[type] + 1);
  const ofType = existing.filter((f) => f.tags.includes(`memory:${type}`));
  if (ofType.length >= LIMITS[type]) await deleteFact(uid, ofType[ofType.length - 1].id); // evict oldest
  const f = await addFact({ uid, workspace: opts.workspace, text: clean, tags: [`memory:${type}`, ...(opts.tags ?? [])], supersedes: opts.supersedes, provenance: { kind: opts.source ?? "memory", ref: opts.ref, confidence: opts.confidence ?? (type === "semantic" ? 0.8 : 0.7), by: opts.by } });
  record({ type: "memory", uid, capability: `memory:${type}`, ok: true, detail: clean.slice(0, 80) });
  return toItem(f);
}
/** Hybrid recall across memory types, optionally time-scoped. */
export async function recall(uid: string, query: string, opts: { types?: MemoryType[]; workspace?: string; k?: number; asOf?: number } = {}): Promise<(MemoryItem & { score: number; via: Hit["via"] })[]> {
  const types = opts.types ?? ["semantic", "procedural", "episodic"]; const out: (MemoryItem & { score: number; via: Hit["via"] })[] = [];
  for (const t of types) { if (t === "short_term" || t === "working") continue; for (const h of await queryFacts(uid, query, { workspace: opts.workspace, k: opts.k ?? 6, asOf: opts.asOf, tags: [`memory:${t}`] })) out.push({ ...toItem(h.fact), score: h.score, via: h.via }); }
  return out.sort((a, b) => b.score - a.score).slice(0, opts.k ?? 8);
}
export async function forget(uid: string, id: string) { return deleteFact(uid, id); }
export async function listMemory(uid: string, type?: MemoryType, workspace?: string, limit = 100): Promise<MemoryItem[]> { return (await listFacts(uid, workspace, 3000)).filter((f) => f.tags.some((t) => t.startsWith("memory:")) && (!type || f.tags.includes(`memory:${type}`))).slice(0, limit).map(toItem); }

// ---- short-term & working (process-local, honest: not persisted across restarts) ----------------
export function pushShortTerm(sessionKey: string, role: string, text: string) { const a = shortTerm.get(sessionKey) ?? []; a.push({ at: Date.now(), role, text: text.slice(0, 2000) }); shortTerm.set(sessionKey, a.slice(-LIMITS.short_term)); }
export function getShortTerm(sessionKey: string) { const a = (shortTerm.get(sessionKey) ?? []).filter((x) => Date.now() - x.at < TTL); shortTerm.set(sessionKey, a); return a; }
export function workingSet(jobId: string, key: string, value: unknown) { const m = working.get(jobId) ?? new Map(); if (m.size >= LIMITS.working && !m.has(key)) m.delete(m.keys().next().value as string); m.set(key, value); working.set(jobId, m); }
export function workingGet(jobId: string, key?: string) { const m = working.get(jobId); if (!m) return key ? undefined : {}; return key ? m.get(key) : Object.fromEntries(m); }
export function workingClear(jobId: string) { working.delete(jobId); }

/** Compose a prompt block from recalled memory. */
export function memoryBlock(items: { type: MemoryType; text: string; confidence: number }[], budget = 3000): string {
  let out = ""; for (const m of items) { const line = `- (${m.type}, ${Math.round(m.confidence * 100)}%) ${m.text}\n`; if (out.length + line.length > budget) break; out += line; }
  return out ? `What you remember about this user/workspace:\n${out}` : "";
}
export function memorySummary() { return { shortTermSessions: shortTerm.size, workingJobs: working.size, limits: LIMITS } as const; }
