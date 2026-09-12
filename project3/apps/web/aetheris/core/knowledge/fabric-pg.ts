/**
 * Knowledge fabric — postgres backend (hosted/Vercel path, e.g. Neon). Same operations as the
 * sqlite backend: `knowledge_facts` + `knowledge_edges` + `knowledge_model` tables behind the
 * shared pool (src/lib/pg.ts). Selected with:
 *
 *   AETHERIS_KNOWLEDGE=postgres  +  POSTGRES_URL=postgres://...
 *
 * Retrieval notes:
 * - Keyword leg is scored in-process over the scoped rows (token overlap + substring
 *   fallback) instead of FTS5: user corpora are small (the sqlite vector leg already caps
 *   its fetch at 5000 rows), one code path is fully hermetic-testable, and ranking stays
 *   identical across restarts. A tsvector/GIN prefilter can be added later if corpora grow.
 * - Vector leg mirrors sqlite exactly: same stored bytes, same space tag, same cosine cutoff.
 * - Fusion, temporal filtering and tag filtering are the shared ranker (fabric-shared.ts),
 *   so both backends rank identically given the same legs.
 * - Timestamps are DOUBLE PRECISION epoch-ms (exact below 2^53; node-postgres returns
 *   BIGINT as string, which would silently mistype every date comparison).
 */
import { randomBytes } from "node:crypto";
import { record } from "../observability/events";
import { ensureSchema, type PgRow } from "@/aetheris/lib/pg";
import { learn, type SemanticModel } from "./semantic";
import {
  cosine, createRanker, embed, extractEntities, extractTriples, lastEmbedMode, loadModel,
  markModelDirty, modelStats, persistModel, semanticEnabled, tok, vecSpace,
  type Edge, type Fact, type Hit, type ModelStore, type QueryOpts,
} from "./fabric-shared";

const SCHEMA: [string, string, string][] = [
  ["kf-facts", `CREATE TABLE IF NOT EXISTS knowledge_facts(
    id TEXT PRIMARY KEY, uid TEXT NOT NULL, workspace TEXT NOT NULL, text TEXT NOT NULL,
    entities JSONB NOT NULL, tags JSONB NOT NULL,
    valid_from DOUBLE PRECISION, valid_to DOUBLE PRECISION, supersedes TEXT,
    prov JSONB NOT NULL, created_at DOUBLE PRECISION NOT NULL,
    vec TEXT, vec_dim INTEGER, vec_space TEXT)`, "knowledge_facts"],
  ["kf-facts-idx", `CREATE INDEX IF NOT EXISTS knowledge_facts_uw ON knowledge_facts(uid, workspace)`, "knowledge_facts"],
  ["kf-edges", `CREATE TABLE IF NOT EXISTS knowledge_edges(
    id TEXT PRIMARY KEY, uid TEXT NOT NULL, workspace TEXT NOT NULL,
    src TEXT NOT NULL, rel TEXT NOT NULL, dst TEXT NOT NULL,
    fact_id TEXT, weight DOUBLE PRECISION NOT NULL, prov JSONB NOT NULL)`, "knowledge_edges"],
  ["kf-edges-src", `CREATE INDEX IF NOT EXISTS knowledge_edges_src ON knowledge_edges(uid, src)`, "knowledge_edges"],
  ["kf-edges-dst", `CREATE INDEX IF NOT EXISTS knowledge_edges_dst ON knowledge_edges(uid, dst)`, "knowledge_edges"],
  ["kf-model", `CREATE TABLE IF NOT EXISTS knowledge_model(id INTEGER PRIMARY KEY, model TEXT NOT NULL, updated_at DOUBLE PRECISION NOT NULL)`, "knowledge_model"],
];

async function pool() {
  let p;
  for (const [key, sql, probe] of SCHEMA) p = await ensureSchema(key, sql, probe);
  return p!;
}

/** JSONB columns arrive parsed from node-postgres; tolerate string form from other drivers. */
const asStrings = (v: unknown): string[] => (typeof v === "string" ? JSON.parse(v) : v) as string[];
const asProv = (v: unknown): Fact["provenance"] => (typeof v === "string" ? JSON.parse(v) : v) as Fact["provenance"];

const rowToFact = (r: PgRow): Fact => ({
  id: r.id as string, uid: r.uid as string, workspace: r.workspace as string, text: r.text as string,
  entities: asStrings(r.entities), tags: asStrings(r.tags),
  validFrom: (r.valid_from as number) ?? undefined, validTo: (r.valid_to as number) ?? undefined,
  supersedes: (r.supersedes as string) ?? undefined, provenance: asProv(r.prov), createdAt: r.created_at as number,
});
const rowToEdge = (r: PgRow, uid: string): Edge => ({
  id: r.id as string, uid, workspace: r.workspace as string, src: r.src as string, rel: r.rel as string,
  dst: r.dst as string, factId: (r.fact_id as string) ?? undefined, weight: r.weight as number, provenance: asProv(r.prov),
});
/**
 * Stored vector → Float32Array. Vectors are base64 TEXT (not BYTEA): identical on node-postgres
 * and pg-mem, with no binary-literal quoting edge cases. The byteOffset-safe slice matters —
 * pooled Buffers share an 8 KiB ArrayBuffer.
 */
const vecOf = (v: unknown): Float32Array => {
  const u8 = typeof v === "string" ? Buffer.from(v, "base64") : v instanceof Uint8Array ? v : new Uint8Array(v as ArrayBuffer);
  return new Float32Array(u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength));
};

const PG_MODEL_ID = "postgres";
const pgModel = (): ModelStore => ({
  load: async () => {
    const rows = (await (await pool()).query("SELECT model FROM knowledge_model WHERE id = 1")).rows;
    return rows[0]?.model as string | undefined;
  },
  save: async (model: string) => {
    await (await pool()).query(
      "INSERT INTO knowledge_model (id, model, updated_at) VALUES (1, $1, $2) ON CONFLICT (id) DO UPDATE SET model = EXCLUDED.model, updated_at = EXCLUDED.updated_at",
      [model, Date.now()]
    );
  },
});

/** uid + workspace + point-in-time scope with correctly numbered $n parameters. */
function scope(uid: string, ws: string | undefined, asOf: number | undefined, alias = "f"): { where: string; params: unknown[] } {
  const conds = [`${alias}.uid = $1`];
  const params: unknown[] = [uid];
  if (ws) { params.push(ws); conds.push(`${alias}.workspace = $${params.length}`); }
  if (asOf !== undefined) {
    params.push(asOf, asOf);
    conds.push(`(${alias}.valid_from IS NULL OR ${alias}.valid_from <= $${params.length - 1})`);
    conds.push(`(${alias}.valid_to IS NULL OR ${alias}.valid_to > $${params.length})`);
  }
  return { where: conds.join(" AND "), params };
}

/** Keyword relevance of one row: distinct query tokens matched (substring fallback for long tokens). */
function keywordScore(r: PgRow, qtokens: string[]): number {
  const hay = `${String(r.text ?? "")} ${asStrings(r.entities).join(" ")} ${asStrings(r.tags).join(" ")}`;
  const hayToks = new Set(tok(hay));
  const hayLower = hay.toLowerCase();
  let s = 0;
  for (const t of new Set(qtokens)) {
    if (hayToks.has(t)) s += 1;
    else if (t.length > 3 && hayLower.includes(t)) s += 0.3;
  }
  return s;
}

export async function addFact(input: { uid: string; workspace?: string; text: string; tags?: string[]; entities?: string[]; validFrom?: number; validTo?: number; supersedes?: string; provenance: Omit<Fact["provenance"], "at"> & { at?: number }; edges?: { src: string; rel: string; dst: string; weight?: number }[] }): Promise<Fact> {
  const p = await pool(); const t0 = Date.now();
  const text = input.text.trim().slice(0, 4000); if (!text) throw new Error("empty fact");
  const entities = input.entities ?? extractEntities(text);
  const f: Fact = { id: randomBytes(6).toString("hex"), uid: input.uid, workspace: input.workspace ?? "default", text, entities, tags: input.tags ?? [], validFrom: input.validFrom ?? (input.supersedes ? Date.now() : undefined), validTo: input.validTo, supersedes: input.supersedes, provenance: { ...input.provenance, at: input.provenance.at ?? Date.now(), confidence: Math.max(0, Math.min(1, input.provenance.confidence)) }, createdAt: Date.now() };
  let m: SemanticModel | undefined;
  if (semanticEnabled()) { m = await loadModel(PG_MODEL_ID, pgModel()); if (learn(m, text)) markModelDirty(PG_MODEL_ID); }
  const vec = await embed(text, m);
  await p.query(
    "INSERT INTO knowledge_facts(id,uid,workspace,text,entities,tags,valid_from,valid_to,supersedes,prov,created_at,vec,vec_dim,vec_space) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)",
    [f.id, f.uid, f.workspace, f.text, JSON.stringify(f.entities), JSON.stringify(f.tags), f.validFrom ?? null, f.validTo ?? null, f.supersedes ?? null, JSON.stringify(f.provenance), f.createdAt, Buffer.from(vec.buffer).toString("base64"), vec.length, vecSpace()]
  );
  if (f.supersedes) await p.query("UPDATE knowledge_facts SET valid_to = COALESCE(valid_to, $1) WHERE id = $2 AND uid = $3", [f.createdAt, f.supersedes, f.uid]);
  const edges: { src: string; rel: string; dst: string; weight?: number }[] = input.edges ?? extractTriples(text, entities);
  for (const e of edges) {
    await p.query("INSERT INTO knowledge_edges VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
      [randomBytes(6).toString("hex"), f.uid, f.workspace, e.src, e.rel, e.dst, f.id, e.weight ?? f.provenance.confidence, JSON.stringify(f.provenance)]);
  }
  persistModel(PG_MODEL_ID, pgModel());
  record({ type: "knowledge", uid: f.uid, capability: "knowledge:add", ok: true, ms: Date.now() - t0, detail: `${entities.length} entities · ${edges.length} edges · ${lastEmbedMode()} embed` });
  return f;
}

export async function reindexEmbeddings(limit = 20_000): Promise<{ reindexed: number; space: string }> {
  const p = await pool();
  const m = await loadModel(PG_MODEL_ID, pgModel());
  const space = vecSpace();
  const rows = (await p.query("SELECT id, text FROM knowledge_facts WHERE COALESCE(vec_space, 'hash') <> $1 ORDER BY created_at DESC LIMIT $2", [space, limit])).rows;
  for (const r of rows) {
    const vec = await embed(String(r.text), m);
    await p.query("UPDATE knowledge_facts SET vec = $1, vec_dim = $2, vec_space = $3 WHERE id = $4", [Buffer.from(vec.buffer).toString("base64"), vec.length, space, r.id]);
  }
  persistModel(PG_MODEL_ID, pgModel());
  record({ type: "knowledge", capability: "knowledge:reindex", ok: true, detail: `${rows.length} facts → ${space}` });
  return { reindexed: rows.length, space };
}

export async function getFact(uid: string, id: string): Promise<Fact | undefined> {
  const rows = (await (await pool()).query("SELECT * FROM knowledge_facts WHERE id = $1 AND uid = $2", [id, uid])).rows;
  return rows[0] ? rowToFact(rows[0]) : undefined;
}
export async function deleteFact(uid: string, id: string): Promise<boolean> {
  const p = await pool();
  const r = await p.query("DELETE FROM knowledge_facts WHERE id = $1 AND uid = $2", [id, uid]);
  await p.query("DELETE FROM knowledge_edges WHERE fact_id = $1 AND uid = $2", [id, uid]);
  return (r.rowCount ?? 0) > 0;
}
export async function listFacts(uid: string, workspace?: string, limit = 100): Promise<Fact[]> {
  const params: unknown[] = [uid];
  let where = "uid = $1";
  if (workspace) { params.push(workspace); where += ` AND workspace = $${params.length}`; }
  params.push(limit);
  const rows = (await (await pool()).query(`SELECT * FROM knowledge_facts WHERE ${where} ORDER BY created_at DESC LIMIT $${params.length}`, params)).rows;
  return rows.map(rowToFact);
}

export async function neighbors(uid: string, entity: string, depth = 1, workspace?: string): Promise<{ nodes: string[]; edges: Edge[] }> {
  const p = await pool(); const seen = new Set<string>([entity]); let frontier = [entity]; const edges: Edge[] = []; const ids = new Set<string>();
  for (let i = 0; i < depth && frontier.length; i++) {
    const next: string[] = [];
    for (const n of frontier) {
      const params: unknown[] = [uid, n, n];
      let where = "uid = $1 AND (LOWER(src) = LOWER($2) OR LOWER(dst) = LOWER($3))";
      if (workspace) { params.push(workspace); where += ` AND workspace = $${params.length}`; }
      const rows = (await p.query(`SELECT * FROM knowledge_edges WHERE ${where} LIMIT 200`, params)).rows;
      for (const r of rows) {
        if (ids.has(r.id as string)) continue; ids.add(r.id as string);
        const e = rowToEdge(r, uid); edges.push(e);
        for (const x of [e.src, e.dst]) if (!seen.has(x)) { seen.add(x); next.push(x); }
      }
    }
    frontier = next;
  }
  return { nodes: [...seen], edges };
}

/** Hybrid query: reciprocal-rank fusion of keyword + vector (+ graph expansion), filtered by time. */
export async function queryFacts(uid: string, q: string, opts: QueryOpts = {}): Promise<Hit[]> {
  const t0 = Date.now(); const k = opts.k ?? 8; const mode = opts.mode ?? "hybrid"; const ws = opts.workspace;
  const ranker = createRanker(k, opts.asOf);
  const qtokens = tok(q);
  let rows: PgRow[] = [];
  if (mode === "hybrid" || mode === "keyword" || mode === "vector") {
    const s = scope(uid, ws, opts.asOf);
    rows = (await (await pool()).query(`SELECT f.* FROM knowledge_facts f WHERE ${s.where} ORDER BY f.created_at DESC LIMIT 5000`, s.params)).rows;
  }
  if (qtokens.length && (mode === "hybrid" || mode === "keyword")) {
    rows.map((r) => ({ f: rowToFact(r), s: keywordScore(r, qtokens) }))
      .filter((x) => x.s > 0).sort((a, b) => b.s - a.s || b.f.createdAt - a.f.createdAt)
      .slice(0, k * 3).forEach((x, i) => ranker.add(x.f, i, "keyword"));
  }
  if (mode === "hybrid" || mode === "vector") {
    const qv = await embed(q, semanticEnabled() ? await loadModel(PG_MODEL_ID, pgModel()) : undefined);
    // Only rows embedded in the same space are comparable; others still rank via keyword/graph/time.
    const space = vecSpace();
    rows.filter((r) => (r.vec_space as string | null) === space && r.vec != null)
      .map((r) => ({ f: rowToFact(r), c: cosine(qv, vecOf(r.vec)) })).filter((x) => x.c > 0.08)
      .sort((a, b) => b.c - a.c).slice(0, k * 3).forEach((x, i) => ranker.add(x.f, i, "vector"));
  }
  if (mode === "hybrid" || mode === "graph") {
    const ents = opts.entity ? [opts.entity] : extractEntities(q).concat(qtokens.filter((w) => w.length > 3)).slice(0, 6);
    const fids = new Set<string>();
    for (const e of ents) for (const ed of (await neighbors(uid, e, 1, ws)).edges) if (ed.factId) fids.add(ed.factId);
    for (const [i, id] of [...fids].slice(0, k * 2).entries()) {
      const params: unknown[] = [id, uid];
      let where = "f.id = $1 AND f.uid = $2";
      if (ws) { params.push(ws); where += ` AND f.workspace = $${params.length}`; }
      if (opts.asOf !== undefined) { params.push(opts.asOf, opts.asOf); where += ` AND (f.valid_from IS NULL OR f.valid_from <= $${params.length - 1}) AND (f.valid_to IS NULL OR f.valid_to > $${params.length})`; }
      const r = (await (await pool()).query(`SELECT f.* FROM knowledge_facts f WHERE ${where}`, params)).rows;
      if (r[0]) ranker.add(rowToFact(r[0]), i, "graph", 0.7);
    }
  }
  const hits = ranker.finish(opts.tags);
  record({ type: "knowledge", uid, capability: "knowledge:query", ok: true, ms: Date.now() - t0, detail: `${mode} · ${hits.length} hits` });
  return hits;
}

export async function fabricStatus() {
  try {
    const p = await pool();
    const c = (await p.query("SELECT (SELECT COUNT(*) FROM knowledge_facts) AS facts, (SELECT COUNT(*) FROM knowledge_edges) AS edges")).rows[0];
    await loadModel(PG_MODEL_ID, pgModel());
    const st = modelStats(PG_MODEL_ID);
    // GROUP BY spells out the expression (ordinal positions crash pg-mem; equivalent on real pg).
    const num = (v: unknown): number => Number(Array.isArray(v) ? v[0] : v);
    const spaces = (await p.query("SELECT COALESCE(vec_space, 'hash') AS sp, COUNT(*) AS n FROM knowledge_facts GROUP BY COALESCE(vec_space, 'hash')")).rows
      .map((r) => `${r.sp}:${Array.isArray(r.n) ? (r.n as unknown[])[0] : r.n}`);
    const facts = num(c.facts), edges = num(c.edges);
    return {
      available: true, engine: "postgres + in-process hybrid rank", facts, edges, dim: 256,
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
