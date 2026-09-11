/**
 * RAVANA · Memory retrieval pipeline (spec §11, §12).
 *
 *   Query → layered candidate retrieval → metadata filtering → keyword scoring →
 *   reranking (importance × recency × relevance) → context compression → caller
 *
 * Layers are queried closest-and-cheapest first (L0 current tokens → L1 working → L2 session →
 * L3 project episodic/semantic → L4 long-term → L5 external). External knowledge is a plug point
 * (web search tool); nothing is fetched unless the query needs it.
 *
 * Rerank is deterministic by default (relevance 60% · importance 25% · recency 15%) so the
 * pipeline is testable offline and never depends on a model call. A model-based reranker can be
 * injected for the final hop.
 */
import type { RavanaMemory, RavanaMemoryType } from "../types";
import { listMemories } from "./stores";

export type MemoryLayer = "working" | "session" | "project" | "long_term";

export interface RetrievedMemory {
  memory: RavanaMemory;
  score: number;
  layer: MemoryLayer;
  /** why this memory was picked — shown in the execution trace */
  reason: string;
}

export interface Reranker {
  rank(query: string, candidates: RetrievedMemory[], topK: number): Promise<RetrievedMemory[]>;
}

const STOP = new Set(["the", "a", "an", "of", "to", "in", "for", "and", "or", "is", "are", "was", "it", "this", "that", "my", "me", "i", "we", "you", "on", "at", "with", "about", "please", "can", "do", "how", "what", "why"]);

export function tokens(s: string): string[] {
  return s.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 1 && !STOP.has(t));
}

/** Keyword relevance in [0,1]: query-term coverage with subword matches. Pure, exported for tests. */
export function relevanceScore(query: string, text: string): number {
  const q = tokens(query);
  const d = tokens(text);
  if (!q.length || !d.length) return 0;
  let hits = 0;
  for (const t of q) {
    if (d.includes(t)) hits += 1;
    else if (d.some((w) => w.startsWith(t) || t.startsWith(w))) hits += 0.4;
  }
  return Math.min(1, hits / q.length);
}

export interface MemorySearchOptions {
  uid: string;
  query: string;
  projectId?: string | null;
  types?: RavanaMemoryType[];
  topK?: number;
  /** include process-local layers (working/session) — engine-internal retrieval wants them. */
  includeLocal?: boolean;
  taskId?: string;
  sessionKey?: string;
  minImportance?: number;
  tags?: string[];
}

/** Deterministic rerank score: relevance 60% · importance 25% · recency 15%. Pure, for tests. */
export function rerankScore(m: RavanaMemory, relevance: number, now = Date.now()): number {
  const recency = Math.max(0, 1 - (now - m.createdAt) / (90 * 24 * 60 * 60_000));
  return 0.6 * relevance + 0.25 * m.importance + 0.15 * recency;
}

const DEFAULT_RERANKER: Reranker = {
  async rank(_query, candidates, topK) {
    return [...candidates].sort((a, b) => b.score - a.score).slice(0, topK);
  },
};

/** Compress retrieved memories into a bounded prompt block (context compression step). */
export function compressToContext(items: RetrievedMemory[], budgetChars = 2200): string {
  let out = "";
  for (const item of items) {
    const line = `- [${item.memory.type}${item.layer === "project" ? " · project" : ""}] ${item.memory.content}\n`;
    if (out.length + line.length > budgetChars) break;
    out += line;
  }
  return out ? `Relevant memory (retrieved ${items.length}, layer ${items[0]?.layer}):\n${out}` : "";
}

/**
 * Full retrieval pipeline over the memory hierarchy:
 *   L1 working (task-local in-process map, when supplied)
 *   L2 session (rolling session context, when supplied)
 *   L3/L4 persisted episodic + semantic, project-filtered (metadata filter before ranking)
 * The final hop goes through the reranker (deterministic unless one is injected).
 */
export async function searchMemories(
  opts: MemorySearchOptions & { local?: { working?: Record<string, unknown>; session?: string[] } },
): Promise<RetrievedMemory[]> {
  const topK = Math.max(1, opts.topK ?? 8);
  const now = Date.now();
  const candidates: RetrievedMemory[] = [];

  // L1 — working memory (task-local scratchpad)
  if (opts.includeLocal !== false && opts.local?.working) {
    for (const [k, v] of Object.entries(opts.local.working)) {
      const text = `${k}: ${typeof v === "string" ? v : JSON.stringify(v).slice(0, 300)}`;
      const rel = relevanceScore(opts.query, text);
      if (rel > 0) {
        candidates.push({
          memory: mkLocal("working", text, k, now),
          score: rel,
          layer: "working",
          reason: `working key "${k}" matched`,
        });
      }
    }
  }

  // L2 — session memory
  if (opts.includeLocal !== false && opts.local?.session?.length) {
    const texts = opts.local.session;
    const rel = Math.max(...texts.map((t) => relevanceScore(opts.query, t)));
    if (rel > 0.15) {
      candidates.push({
        memory: mkLocal("session", texts.join(" ").slice(0, 1500), "session", now),
        score: rel,
        layer: "session",
        reason: "session context matched",
      });
    }
  }

  // L3/L4 — persisted episodic + semantic memory (project-scoped when a project is active)
  const types = new Set((opts.types ?? ["episodic", "semantic"]).filter((t): t is "episodic" | "semantic" => t === "episodic" || t === "semantic"));
  const persisted = await listMemories(opts.uid, { projectId: opts.projectId, limit: 400 });
  for (const m of persisted) {
    if (types.size && !types.has(m.type as "episodic" | "semantic")) continue;
    if (opts.minImportance && m.importance < opts.minImportance) continue;
    if (opts.tags?.length && !m.tags.some((t) => opts.tags!.includes(t))) continue;
    const rel = relevanceScore(opts.query, m.content);
    const score = rerankScore(m, rel, now);
    if (rel === 0 && m.importance < 0.65) continue; // don't pad context with noise
    candidates.push({
      memory: m,
      score,
      layer: m.projectId === opts.projectId && opts.projectId ? "project" : "long_term",
      reason: rel > 0.05 ? `matched ${Math.round(rel * 100)}% of query terms` : "kept for importance",
    });
  }

  const sorted = [...candidates].sort((a, b) => b.score - a.score);
  const reranked = await DEFAULT_RERANKER.rank(opts.query, sorted, topK);
  return reranked.map((r) => ({ ...r, score: Math.round(r.score * 1000) / 1000 }));
}

function mkLocal(type: "working" | "session", content: string, key: string, at: number): RavanaMemory {
  return { id: `${type}:${key}`, uid: "", projectId: null, type, content: content.slice(0, 1500), tags: [key], importance: 0.5, createdAt: at, source: type };
}
