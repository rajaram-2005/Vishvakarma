/**
 * Knowledge fabric — backend-agnostic core shared by the sqlite (local) and postgres
 * (hosted) backends: public types, pure text/embedding helpers, the embedding-mode
 * resolver, the learned semantic-model cache, and the reciprocal-rank fusion used by
 * hybrid queries. Storage lives in fabric-sqlite.ts / fabric-pg.ts.
 */
import { createHash } from "node:crypto";
import { hydrateRouterStores } from "@/aetheris/lib/router/hydrate";
import { resolvedEnv } from "@/aetheris/lib/router/runtimeKeys";
import * as semantic from "./semantic";

export type SourceKind = "user" | "document" | "web" | "agent" | "device" | "github" | "research" | "memory" | "import";
export interface Provenance { kind: SourceKind; ref?: string; confidence: number; by?: string; at: number }
export interface Fact {
  id: string; uid: string; workspace: string; text: string; entities: string[]; tags: string[];
  validFrom?: number; validTo?: number; supersedes?: string; provenance: Provenance; createdAt: number;
}
export interface Edge { id: string; uid: string; workspace: string; src: string; rel: string; dst: string; factId?: string; weight: number; provenance: Provenance }
export interface Hit { fact: Fact; score: number; via: ("keyword" | "vector" | "graph" | "temporal")[] }
export interface QueryOpts { workspace?: string; k?: number; asOf?: number; entity?: string; tags?: string[]; mode?: "hybrid" | "keyword" | "vector" | "graph" }

export const DIM = 256;

/** Word tokenizer: lowercase NFKC alphanumeric runs. Shared so every backend scores identically. */
export const tok = (s: string) => s.toLowerCase().normalize("NFKC").match(/[\p{L}\p{N}]+/gu) ?? [];
/** Deterministic hashed word + bigram embedding. Free, offline, language-agnostic. */
export function localEmbed(text: string): Float32Array {
  const v = new Float32Array(DIM); const t = tok(text);
  const bump = (g: string, w: number) => { const h = createHash("md5").update(g).digest(); const i = h.readUInt16LE(0) % DIM; v[i] += (h[2] & 1 ? 1 : -1) * w; };
  t.forEach((w, i) => { bump(w, 1); if (i) bump(`${t[i - 1]}_${w}`, 0.6); if (w.length > 5) for (let j = 0; j + 4 <= w.length; j++) bump(`#${w.slice(j, j + 4)}`, 0.25); });
  let n = 0; for (const x of v) n += x * x; n = Math.sqrt(n) || 1; for (let i = 0; i < DIM; i++) v[i] /= n; return v;
}
export const cosine = (a: Float32Array, b: Float32Array) => { let s = 0; for (let i = 0; i < a.length && i < b.length; i++) s += a[i] * b[i]; return s; };

/**
 * Which space a stored vector lives in. Vectors from different spaces are NOT comparable, so every
 * row is tagged and the vector search only compares like with like.
 */
export const vecSpace = () => (semanticEnabled() ? "semantic" : process.env.EMBEDDINGS_URL ? "provider" : "hash");
export const semanticEnabled = () => process.env.AETHERIS_SEMANTIC !== "0";

// ---- learned semantic model (one cached model per backend id) -----------------------------------
export type ModelStore = { load: () => Promise<string | undefined>; save: (model: string) => Promise<void> };
const modelCaches = new Map<string, { model?: semantic.SemanticModel; dirty: boolean }>();
export async function loadModel(id: string, store: ModelStore): Promise<semantic.SemanticModel> {
  let c = modelCaches.get(id);
  if (!c) { c = { dirty: false }; modelCaches.set(id, c); }
  if (!c.model) {
    try {
      const raw = await store.load();
      c.model = raw ? semantic.deserialize(raw) : semantic.createModel();
    } catch { c.model = semantic.createModel(); }
  }
  return c.model;
}
export function markModelDirty(id: string) {
  const c = modelCaches.get(id);
  if (c) c.dirty = true;
}
/** Write the learned model back. Failures are non-fatal (the corpus is the source). */
export async function persistModel(id: string, store: ModelStore) {
  const c = modelCaches.get(id);
  if (!c?.dirty || !c.model) return;
  c.dirty = false;
  try { await store.save(semantic.serialize(c.model)); } catch { c.dirty = true; }
}
export function modelStats(id: string) {
  return semantic.stats(modelCaches.get(id)?.model ?? semantic.createModel());
}

// ---- embedding ----------------------------------------------------------------------------------
let embedMode: "local" | "semantic" | "provider" = "local";
/** Which embedder served the last call (informational: surfaced in observability detail strings). */
export const lastEmbedMode = () => embedMode;
export async function embed(text: string, model?: semantic.SemanticModel): Promise<Float32Array> {
  await hydrateRouterStores(); // hosted: refresh runtime keys (TTL-gated; no-op on files)
  const url = process.env.EMBEDDINGS_URL, key = resolvedEnv("EMBEDDINGS_KEY"), modelName = process.env.EMBEDDINGS_MODEL ?? "text-embedding-3-small";
  if (url && key) {
    try {
      const r = await fetch(url.replace(/\/$/, "") + "/embeddings", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` }, body: JSON.stringify({ model: modelName, input: text.slice(0, 8000) }), signal: AbortSignal.timeout(15_000) });
      if (r.ok) { const j = (await r.json()) as { data: { embedding: number[] }[] }; embedMode = "provider"; return Float32Array.from(j.data[0].embedding); }
    } catch { /* fall back to local */ }
  }
  if (semanticEnabled() && model && model.learnedFrom > 0) {
    // A model that has learned nothing yet is no better than the lexical hash, so fall through.
    embedMode = "semantic";
    return semantic.vector(model, text);
  }
  embedMode = "local"; return localEmbed(text);
}

// ---- extraction (pure; tested) ------------------------------------------------------------------
/** Naive entity extraction: Capitalised spans, @handles, #tags, code identifiers, quoted terms. */
export function extractEntities(text: string): string[] {
  const out = new Set<string>(); const STOP = new Set(["The", "A", "An", "This", "That", "It", "In", "On", "At", "To", "For", "Of", "And", "Or", "But", "If", "When", "Then", "We", "I", "You", "He", "She", "They"]);
  for (const m of text.matchAll(/\b([A-Z][\w-]*(?:\s+(?:[A-Z][\w-]*|\d+)){0,3})\b/g)) { const words = m[1].split(/\s+/).filter((w, i) => !(i === 0 && STOP.has(w))); const e = words.join(" "); if (e.length > 1 && !STOP.has(e)) out.add(e); }
  for (const m of text.matchAll(/[@#]([\w-]{2,})/g)) out.add(m[1]);
  for (const m of text.matchAll(/`([^`]{2,40})`/g)) out.add(m[1]);
  for (const m of text.matchAll(/"([^"]{3,40})"/g)) out.add(m[1]);
  return [...out].slice(0, 16);
}
/** Extract (subject, relation, object) triples from simple "X <verb> Y" sentences. Heuristic. */
export function extractTriples(text: string, entities: string[]): { src: string; rel: string; dst: string }[] {
  const t: { src: string; rel: string; dst: string }[] = [];
  const rels = ["is a", "is an", "is", "uses", "owns", "works at", "works on", "built", "created", "depends on", "part of", "located in", "runs on", "prefers", "likes", "manages", "reports to", "connected to", "controls", "measures", "feeds", "supplies", "powers", "monitors", "drives", "cools", "heats", "in"];
  for (const s of entities) for (const o of entities) {
    if (s === o) continue;
    for (const r of rels) { const re = new RegExp(`${s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+(?:\\w+\\s+){0,2}?${r}\\s+(?:\\w+\\s+){0,2}?${o.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i"); if (re.test(text)) { t.push({ src: s, rel: r.replace(/\s+/g, "_"), dst: o }); break; } }
  }
  return t.slice(0, 24);
}

/** Render hits as a grounding block with numbered provenance for prompts. */
export function knowledgeBlock(hits: Hit[], budget = 6000): string {
  let out = "", n = 0; for (const h of hits) { const line = `[K${++n}] ${h.fact.text} (source: ${h.fact.provenance.kind}${h.fact.provenance.ref ? " " + h.fact.provenance.ref : ""}, confidence ${h.fact.provenance.confidence.toFixed(2)}${h.fact.validTo ? ", superseded" : ""})\n`; if (out.length + line.length > budget) break; out += line; }
  return out ? `Knowledge fabric (cite as [K#]):\n${out}` : "";
}

// ---- reciprocal-rank fusion (shared so both backends rank identically) ---------------------------
export function createRanker(k: number, asOf?: number) {
  const ranks = new Map<string, { fact: Fact; s: number; via: Set<Hit["via"][number]> }>();
  return {
    add(f: Fact, rank: number, via: Hit["via"][number], w = 1) {
      const cur = ranks.get(f.id) ?? { fact: f, s: 0, via: new Set<Hit["via"][number]>() };
      cur.s += w / (60 + rank); cur.via.add(via);
      if (asOf) cur.via.add("temporal");
      ranks.set(f.id, cur);
    },
    finish(tags?: string[]): Hit[] {
      let hits = [...ranks.values()].map((x) => ({ fact: x.fact, score: x.s * (0.5 + 0.5 * x.fact.provenance.confidence), via: [...x.via] }));
      if (tags?.length) hits = hits.filter((h) => tags.every((t) => h.fact.tags.includes(t)));
      hits.sort((a, b) => b.score - a.score);
      return hits.slice(0, k);
    },
  };
}
export type Ranker = ReturnType<typeof createRanker>;
