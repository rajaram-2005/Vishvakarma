/**
 * Knowledge Fabric (Phase 8) — hybrid retrieval with provenance and workspace scope:
 *
 *   keyword   FTS5 (BM25) on sqlite · in-process token scorer on postgres
 *   vector    cosine over embeddings (local hashed n-gram by default; provider
 *             embeddings when EMBEDDINGS_URL/KEY set)
 *   graph     entity/relation triples with provenance per edge
 *   temporal  valid_from / valid_to / observed point-in-time queries, supersession
 *
 * Local default is sqlite (`data/knowledge.sqlite`); hosted/Vercel mode uses Postgres:
 *
 *   AETHERIS_KNOWLEDGE=postgres  +  POSTGRES_URL=postgres://...
 *
 * The backend is resolved per call (not at import) so tests can switch modes by setting env.
 * Pure helpers live in fabric-shared.ts; storage in fabric-sqlite.ts / fabric-pg.ts.
 */
import * as sqlite from "./fabric-sqlite";
import * as pg from "./fabric-pg";
import {
  cosine, extractEntities, extractTriples, knowledgeBlock, localEmbed,
  type Edge, type Fact, type Hit, type Provenance, type QueryOpts, type SourceKind,
} from "./fabric-shared";

export {
  cosine, extractEntities, extractTriples, knowledgeBlock, localEmbed,
  type Edge, type Fact, type Hit, type Provenance, type QueryOpts, type SourceKind,
};

const isPg = () => process.env.AETHERIS_KNOWLEDGE === "postgres";

type AddFactInput = Parameters<typeof sqlite.addFact>[0];
export function addFact(input: AddFactInput): Promise<Fact> {
  return isPg() ? pg.addFact(input) : sqlite.addFact(input);
}
export function reindexEmbeddings(limit?: number): Promise<{ reindexed: number; space: string }> {
  return isPg() ? pg.reindexEmbeddings(limit) : sqlite.reindexEmbeddings(limit);
}
export function getFact(uid: string, id: string): Promise<Fact | undefined> {
  return isPg() ? pg.getFact(uid, id) : sqlite.getFact(uid, id);
}
export function deleteFact(uid: string, id: string): Promise<boolean> {
  return isPg() ? pg.deleteFact(uid, id) : sqlite.deleteFact(uid, id);
}
export function listFacts(uid: string, workspace?: string, limit?: number): Promise<Fact[]> {
  return isPg() ? pg.listFacts(uid, workspace, limit) : sqlite.listFacts(uid, workspace, limit);
}
export function neighbors(uid: string, entity: string, depth?: number, workspace?: string): Promise<{ nodes: string[]; edges: Edge[] }> {
  return isPg() ? pg.neighbors(uid, entity, depth, workspace) : sqlite.neighbors(uid, entity, depth, workspace);
}
export function queryFacts(uid: string, q: string, opts?: QueryOpts): Promise<Hit[]> {
  return isPg() ? pg.queryFacts(uid, q, opts) : sqlite.queryFacts(uid, q, opts);
}
export function fabricStatus() {
  return isPg() ? pg.fabricStatus() : sqlite.fabricStatus();
}

// ---- Bridge to the original document knowledge bases (src/lib/kb) --------------------------------
/**
 * Unified query: fabric facts + the user's document KBs (BM25 chunks) in one ranked list, each hit
 * carrying provenance. Document chunks become transient Facts (not persisted) with kind "document".
 */
export async function queryUnified(uid: string, q: string, opts: QueryOpts & { includeDocuments?: boolean; kbIds?: string[] } = {}): Promise<Hit[]> {
  const facts = await queryFacts(uid, q, opts);
  if (opts.includeDocuments === false) return facts;
  const { listKbs, getKb, search } = await import("@/aetheris/lib/kb");
  const kbs = (await listKbs(uid)).filter((k) => !opts.kbIds || opts.kbIds.includes(k.id));
  const k = opts.k ?? 8; const docHits: Hit[] = [];
  for (const meta of kbs) {
    const kb = await getKb(meta.id); if (!kb?.chunks.length) continue;
    for (const { chunk, score } of search(kb.chunks, q, k)) {
      const doc = kb.docs.find((d) => d.id === chunk.doc);
      docHits.push({ score: score / 10, via: ["keyword"], fact: { id: `kb:${kb.id}:${chunk.id}`, uid, workspace: opts.workspace ?? "default", text: chunk.text, entities: [], tags: ["document", `kb:${kb.id}`], createdAt: doc?.addedAt ?? kb.updatedAt, provenance: { kind: "document", ref: `${kb.name} / ${doc?.name ?? chunk.doc}${chunk.page ? ` p.${chunk.page}` : ""}${chunk.section ? ` § ${chunk.section}` : ""}`, confidence: 0.85, at: doc?.addedAt ?? kb.updatedAt } } });
    }
  }
  return [...facts, ...docHits].sort((a, b) => b.score - a.score).slice(0, k);
}
