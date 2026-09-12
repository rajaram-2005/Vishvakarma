/**
 * Knowledge fabric — sqlite backend (local default). Hybrid retrieval over one SQLite file
 * (node:sqlite, zero deps): FTS5/BM25 keyword leg, in-process cosine vector leg over stored
 * embeddings, entity/relation graph leg, temporal filters. See fabric-shared.ts for the
 * backend-agnostic core; fabric.ts dispatches between this and the postgres backend.
 */
import path from "node:path";
import { mkdirSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { record } from "../observability/events";
import { learn, type SemanticModel } from "./semantic";
import {
  cosine, createRanker, DIM, embed, extractEntities, extractTriples, lastEmbedMode, loadModel, markModelDirty,
  modelStats, persistModel, semanticEnabled, tok, vecSpace,
  type Edge, type Fact, type Hit, type ModelStore, type QueryOpts,
} from "./fabric-shared";

/**
 * Resolved per call, not at import: `AETHERIS_DATA_DIR` and `AETHERIS_KNOWLEDGE_DB` are
 * configuration. A module-load-time read freezes whatever the environment held when this module was
 * first imported, so every process started from the same working directory would share one
 * `data/knowledge.sqlite` no matter what the data directory was set to afterwards. That is the same
 * defect that made `npm test` fail on parallel GitHub runners via `core/observability/events.ts`; see
 * tests/data-dir-isolation.test.ts.
 */
const DIR = () => process.env.AETHERIS_DATA_DIR ?? path.join(process.cwd(), "data");
const DB_FILE = () => process.env.AETHERIS_KNOWLEDGE_DB ?? path.join(DIR(), "knowledge.sqlite");

interface Db { exec(sql: string): void; prepare(sql: string): { run(...a: unknown[]): unknown; all(...a: unknown[]): Record<string, unknown>[]; get(...a: unknown[]): Record<string, unknown> | undefined } }
/** One handle per resolved database file: the path is configuration, so it can change between calls. */
const dbs = new Map<string, Db>();
/** Why a given file could not be opened, so a failure is reported once per path instead of retried. */
const dbErrs = new Map<string, string>();
async function open(): Promise<Db> {
  const file = DB_FILE();
  const cached = dbs.get(file);
  if (cached) return cached;
  const failed = dbErrs.get(file);
  if (failed) throw new Error(failed);
  try {
    const { DatabaseSync } = (await import("node:sqlite")) as unknown as { DatabaseSync: new (p: string) => Db };
    mkdirSync(path.dirname(file), { recursive: true });
    const d = new DatabaseSync(file);
    d.exec(`PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS facts(id TEXT PRIMARY KEY, uid TEXT, workspace TEXT, text TEXT, entities TEXT, tags TEXT, valid_from INTEGER, valid_to INTEGER, supersedes TEXT, prov TEXT, created_at INTEGER, vec BLOB, vec_dim INTEGER, vec_space TEXT);
      CREATE TABLE IF NOT EXISTS semantic_model(id INTEGER PRIMARY KEY CHECK (id = 1), model TEXT NOT NULL, updated_at INTEGER);
      CREATE INDEX IF NOT EXISTS facts_uw ON facts(uid, workspace);
      CREATE VIRTUAL TABLE IF NOT EXISTS facts_fts USING fts5(id UNINDEXED, text, entities, tags);
      CREATE TABLE IF NOT EXISTS edges(id TEXT PRIMARY KEY, uid TEXT, workspace TEXT, src TEXT, rel TEXT, dst TEXT, fact_id TEXT, weight REAL, prov TEXT);
      CREATE INDEX IF NOT EXISTS edges_src ON edges(uid, src); CREATE INDEX IF NOT EXISTS edges_dst ON edges(uid, dst);`);
    try { d.exec("ALTER TABLE facts ADD COLUMN vec_space TEXT"); } catch { /* column already present */ }
    dbs.set(file, d); return d;
  } catch (e) {
    const reason = `knowledge fabric unavailable: ${(e as Error).message}`;
    dbErrs.set(file, reason);
    throw new Error(reason);
  }
}
const rowToFact = (r: Record<string, unknown>): Fact => ({ id: r.id as string, uid: r.uid as string, workspace: r.workspace as string, text: r.text as string, entities: JSON.parse(r.entities as string), tags: JSON.parse(r.tags as string), validFrom: (r.valid_from as number) ?? undefined, validTo: (r.valid_to as number) ?? undefined, supersedes: (r.supersedes as string) ?? undefined, provenance: JSON.parse(r.prov as string), createdAt: r.created_at as number });
const vecOf = (r: Record<string, unknown>) => new Float32Array(new Uint8Array(r.vec as Uint8Array).buffer.slice(0));

const sqliteModel = (d: Db): ModelStore => ({
  load: async () => {
    const row = d.prepare("SELECT model FROM semantic_model WHERE id=1").get();
    return row ? String(row.model) : undefined;
  },
  save: async (model: string) => {
    d.prepare("INSERT INTO semantic_model (id, model, updated_at) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET model=excluded.model, updated_at=excluded.updated_at").run(model, Date.now());
  },
});

export async function addFact(input: { uid: string; workspace?: string; text: string; tags?: string[]; entities?: string[]; validFrom?: number; validTo?: number; supersedes?: string; provenance: Omit<Fact["provenance"], "at"> & { at?: number }; edges?: { src: string; rel: string; dst: string; weight?: number }[] }): Promise<Fact> {
  const d = await open(); const t0 = Date.now();
  const text = input.text.trim().slice(0, 4000); if (!text) throw new Error("empty fact");
  const entities = input.entities ?? extractEntities(text);
  const f: Fact = { id: randomBytes(6).toString("hex"), uid: input.uid, workspace: input.workspace ?? "default", text, entities, tags: input.tags ?? [], validFrom: input.validFrom ?? (input.supersedes ? Date.now() : undefined), validTo: input.validTo, supersedes: input.supersedes, provenance: { ...input.provenance, at: input.provenance.at ?? Date.now(), confidence: Math.max(0, Math.min(1, input.provenance.confidence)) }, createdAt: Date.now() };
  const modelId = DB_FILE();
  let m: SemanticModel | undefined;
  if (semanticEnabled()) { m = await loadModel(modelId, sqliteModel(d)); if (learn(m, text)) markModelDirty(modelId); }
  const vec = await embed(text, m);
  d.prepare("INSERT INTO facts(id,uid,workspace,text,entities,tags,valid_from,valid_to,supersedes,prov,created_at,vec,vec_dim,vec_space) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(f.id, f.uid, f.workspace, f.text, JSON.stringify(f.entities), JSON.stringify(f.tags), f.validFrom ?? null, f.validTo ?? null, f.supersedes ?? null, JSON.stringify(f.provenance), f.createdAt, new Uint8Array(vec.buffer), vec.length, vecSpace());
  d.prepare("INSERT INTO facts_fts(id,text,entities,tags) VALUES(?,?,?,?)").run(f.id, f.text, f.entities.join(" "), f.tags.join(" "));
  if (f.supersedes) d.prepare("UPDATE facts SET valid_to=COALESCE(valid_to,?) WHERE id=? AND uid=?").run(f.createdAt, f.supersedes, f.uid);
  const edges: { src: string; rel: string; dst: string; weight?: number }[] = input.edges ?? extractTriples(text, entities);
  const ins = d.prepare("INSERT INTO edges VALUES(?,?,?,?,?,?,?,?,?)");
  for (const e of edges) ins.run(randomBytes(6).toString("hex"), f.uid, f.workspace, e.src, e.rel, e.dst, f.id, e.weight ?? f.provenance.confidence, JSON.stringify(f.provenance));
  persistModel(modelId, sqliteModel(d));
  record({ type: "knowledge", uid: f.uid, capability: "knowledge:add", ok: true, ms: Date.now() - t0, detail: `${entities.length} entities · ${edges.length} edges · ${lastEmbedMode()} embed` });
  return f;
}

/**
 * Re-embed every stored fact in the current space. Needed when the embedding mode changes (or after
 * the corpus has grown enough for the semantic model to be worth switching to); until then, older
 * rows simply rank through keyword/graph/temporal instead of vector.
 */
export async function reindexEmbeddings(limit = 20_000): Promise<{ reindexed: number; space: string }> {
  const d = await open();
  const m = await loadModel(DB_FILE(), sqliteModel(d));
  const space = vecSpace();
  const rows = d.prepare("SELECT id, text FROM facts WHERE COALESCE(vec_space, 'hash') <> ? ORDER BY created_at DESC LIMIT ?").all(space, limit);
  const upd = d.prepare("UPDATE facts SET vec=?, vec_dim=?, vec_space=? WHERE id=?");
  for (const r of rows) {
    const vec = await embed(String(r.text), m);
    upd.run(new Uint8Array(vec.buffer), vec.length, space, r.id as string);
  }
  persistModel(DB_FILE(), sqliteModel(d));
  record({ type: "knowledge", capability: "knowledge:reindex", ok: true, detail: `${rows.length} facts → ${space}` });
  return { reindexed: rows.length, space };
}

export async function getFact(uid: string, id: string): Promise<Fact | undefined> { const r = (await open()).prepare("SELECT * FROM facts WHERE id=? AND uid=?").get(id, uid); return r ? rowToFact(r) : undefined; }
export async function deleteFact(uid: string, id: string): Promise<boolean> { const d = await open(); const r = d.prepare("DELETE FROM facts WHERE id=? AND uid=?").run(id, uid) as { changes: number }; d.prepare("DELETE FROM facts_fts WHERE id=?").run(id); d.prepare("DELETE FROM edges WHERE fact_id=? AND uid=?").run(id, uid); return r.changes > 0; }
export async function listFacts(uid: string, workspace?: string, limit = 100): Promise<Fact[]> { return (await open()).prepare(`SELECT * FROM facts WHERE uid=? ${workspace ? "AND workspace=?" : ""} ORDER BY created_at DESC LIMIT ?`).all(...(workspace ? [uid, workspace, limit] : [uid, limit])).map(rowToFact); }

export async function neighbors(uid: string, entity: string, depth = 1, workspace?: string): Promise<{ nodes: string[]; edges: Edge[] }> {
  const d = await open(); const seen = new Set<string>([entity]); let frontier = [entity]; const edges: Edge[] = []; const ids = new Set<string>();
  for (let i = 0; i < depth && frontier.length; i++) {
    const next: string[] = [];
    for (const n of frontier) {
      const rows = d.prepare(`SELECT * FROM edges WHERE uid=? AND (src=? COLLATE NOCASE OR dst=? COLLATE NOCASE) ${workspace ? "AND workspace=?" : ""} LIMIT 200`).all(...(workspace ? [uid, n, n, workspace] : [uid, n, n]));
      for (const r of rows) { if (ids.has(r.id as string)) continue; ids.add(r.id as string); const e: Edge = { id: r.id as string, uid, workspace: r.workspace as string, src: r.src as string, rel: r.rel as string, dst: r.dst as string, factId: (r.fact_id as string) ?? undefined, weight: r.weight as number, provenance: JSON.parse(r.prov as string) }; edges.push(e); for (const x of [e.src, e.dst]) if (!seen.has(x)) { seen.add(x); next.push(x); } }
    }
    frontier = next;
  }
  return { nodes: [...seen], edges };
}

/** Hybrid query: reciprocal-rank fusion of keyword + vector (+ graph expansion), filtered by time. */
export async function queryFacts(uid: string, q: string, opts: QueryOpts = {}): Promise<Hit[]> {
  const d = await open(); const t0 = Date.now(); const k = opts.k ?? 8; const mode = opts.mode ?? "hybrid"; const ws = opts.workspace;
  const time = opts.asOf ? " AND (valid_from IS NULL OR valid_from<=?) AND (valid_to IS NULL OR valid_to>?)" : ""; const timeArgs = opts.asOf ? [opts.asOf, opts.asOf] : [];
  const scoped = (extra = "") => `f.uid=? ${ws ? "AND f.workspace=?" : ""}${time}${extra}`; const scopedArgs = (...a: unknown[]) => [uid, ...(ws ? [ws] : []), ...timeArgs, ...a];
  const ranker = createRanker(k, opts.asOf);
  const ftsQ = tok(q).map((w) => `"${w.replace(/"/g, "")}"`).join(" OR ");
  if (ftsQ && (mode === "hybrid" || mode === "keyword")) {
    try { d.prepare(`SELECT f.*, bm25(facts_fts) AS r FROM facts_fts JOIN facts f ON f.id=facts_fts.id WHERE facts_fts MATCH ? AND ${scoped()} ORDER BY r LIMIT ?`).all(ftsQ, ...scopedArgs(k * 3)).forEach((r, i) => ranker.add(rowToFact(r), i, "keyword")); } catch { /* malformed FTS query */ }
  }
  if (mode === "hybrid" || mode === "vector") {
    const qv = await embed(q, semanticEnabled() ? await loadModel(DB_FILE(), sqliteModel(d)) : undefined);
    // Only rows embedded in the same space are comparable; others still rank via keyword/graph/time.
    const space = vecSpace();
    d.prepare(`SELECT f.* FROM facts f WHERE ${scoped()} ORDER BY created_at DESC LIMIT 5000`).all(...scopedArgs())
      .filter((r) => (r.vec_space as string | null) === space)
      .map((r) => ({ f: rowToFact(r), c: cosine(qv, vecOf(r)) })).filter((x) => x.c > 0.08).sort((a, b) => b.c - a.c).slice(0, k * 3).forEach((x, i) => ranker.add(x.f, i, "vector"));
  }
  if (mode === "hybrid" || mode === "graph") {
    const ents = opts.entity ? [opts.entity] : extractEntities(q).concat(tok(q).filter((w) => w.length > 3)).slice(0, 6);
    const fids = new Set<string>();
    for (const e of ents) for (const ed of (await neighbors(uid, e, 1, ws)).edges) if (ed.factId) fids.add(ed.factId);
    [...fids].slice(0, k * 2).forEach((id, i) => { const r = d.prepare(`SELECT f.* FROM facts f WHERE f.id=? AND ${scoped()}`).get(id, ...scopedArgs()); if (r) ranker.add(rowToFact(r), i, "graph", 0.7); });
  }
  const hits = ranker.finish(opts.tags);
  record({ type: "knowledge", uid, capability: "knowledge:query", ok: true, ms: Date.now() - t0, detail: `${mode} · ${hits.length} hits` });
  return hits;
}

export async function fabricStatus() {
  try {
    const d = await open();
    const c = d.prepare("SELECT (SELECT COUNT(*) FROM facts) AS facts, (SELECT COUNT(*) FROM edges) AS edges").get()!;
    await loadModel(DB_FILE(), sqliteModel(d));
    const st = modelStats(DB_FILE());
    const spaces = d.prepare("SELECT COALESCE(vec_space, 'hash') AS sp, COUNT(*) AS n FROM facts GROUP BY 1").all().map((r) => `${r.sp}:${r.n}`);
    return {
      available: true, engine: "node:sqlite + FTS5", facts: c.facts as number, edges: c.edges as number, dim: DIM,
      embeddings: process.env.EMBEDDINGS_URL
        ? "provider (EMBEDDINGS_URL) — preferred over the local model"
        : st.learnedFrom > 0
          ? `local semantic (random indexing, ${st.words} words from ${st.learnedFrom} documents, offline)`
          : "local hashed n-gram (lexical) — no corpus learned yet; set AETHERIS_SEMANTIC=0 to stay lexical",
      semantic: { enabled: semanticEnabled(), ...st },
      vecSpaces: spaces,
    };
  }
  catch (e) { return { available: false, error: (e as Error).message }; }
}
