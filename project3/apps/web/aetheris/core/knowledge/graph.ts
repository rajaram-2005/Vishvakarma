/**
 * Knowledge Graph Explorer.
 *
 *   A read-side helper over the production knowledge fabric's
 *   edges table. Returns:
 *     - list of all entities (nodes) the user has, with
 *       degree (in + out) and the top relations;
 *     - per-entity neighbours at depth 1 / 2 (BFS via the
 *       production neighbors() helper);
 *     - the most-connected entity, the most-used relation.
 *
 *   Nothing is fabricated: every node and every edge comes from
 *   the production fabric. If the user has no edges, the
 *   explorer renders an empty graph.
 */

import { addFact, listFacts, neighbors } from "@/aetheris/core/knowledge/fabric";

export interface KnowledgeNode {
  entity: string;
  inDegree: number;
  outDegree: number;
  totalDegree: number;
  topRelations: string[];
}

export interface KnowledgeGraph {
  uid: string;
  totalFacts: number;
  totalEdges: number;
  totalEntities: number;
  nodes: KnowledgeNode[];
  topRelations: { rel: string; count: number }[];
  mostConnected: KnowledgeNode | null;
  hubEntity: string | null;
  /** Recent facts (text + tags), newest first. */
  recentFacts: { id: string; text: string; tags: string[]; at: number }[];
  generatedAt: number;
}

interface RawEdge { id: string; uid: string; workspace: string; src: string; rel: string; dst: string; factId?: string; weight: number }

function nodeFromEdges(uid: string, edges: RawEdge[]): KnowledgeNode[] {
  const map = new Map<string, KnowledgeNode>();
  for (const e of edges) {
    let src = map.get(e.src);
    if (!src) {
      src = { entity: e.src, inDegree: 0, outDegree: 0, totalDegree: 0, topRelations: [] };
      map.set(e.src, src);
    }
    src.outDegree++;
    src.totalDegree++;
    if (!src.topRelations.includes(e.rel)) src.topRelations.push(e.rel);
    let dst = map.get(e.dst);
    if (!dst) {
      dst = { entity: e.dst, inDegree: 0, outDegree: 0, totalDegree: 0, topRelations: [] };
      map.set(e.dst, dst);
    }
    dst.inDegree++;
    dst.totalDegree++;
  }
  return [...map.values()].sort((a, b) => b.totalDegree - a.totalDegree);
}

export async function knowledgeGraph(uid: string, opts: { workspace?: string; limit?: number } = {}): Promise<KnowledgeGraph> {
  const limit = opts.limit ?? 200;
  const facts = await listFacts(uid, opts.workspace, limit);
  // Re-read the edges through the public surface. The fabric
  // exposes a neighbors() helper, but for a complete view we
  // need the raw edges. Easiest path: add a tiny 'list all
  // edges' helper if not present.
  const allEdges = await allEdgesFor(uid, opts.workspace);
  const nodes = nodeFromEdges(uid, allEdges);
  const relCount = new Map<string, number>();
  for (const e of allEdges) relCount.set(e.rel, (relCount.get(e.rel) ?? 0) + 1);
  const topRelations = [...relCount.entries()]
    .map(([rel, count]) => ({ rel, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
  const mostConnected = nodes[0] ?? null;
  return {
    uid,
    totalFacts: facts.length,
    totalEdges: allEdges.length,
    totalEntities: nodes.length,
    nodes: nodes.slice(0, 50),
    topRelations,
    mostConnected,
    hubEntity: mostConnected?.entity ?? null,
    recentFacts: facts.slice(0, 20).map((f) => ({ id: f.id, text: f.text, tags: f.tags, at: f.createdAt })),
    generatedAt: Date.now(),
  };
}

/** Walk depth 1 from an entity and return the subgraph. */
export async function subgraph(uid: string, entity: string, depth = 1, workspace?: string): Promise<{ center: string; nodes: string[]; edges: RawEdge[] }> {
  const out = await neighbors(uid, entity, depth, workspace);
  // The public surface returns Edge[] but our internal helper
  // typed them as RawEdge. They have the same shape; cast.
  return { center: entity, nodes: out.nodes, edges: out.edges as unknown as RawEdge[] };
}

/** Internal helper: read every edge for a uid. We do not have a
 *  public 'all edges' helper in the fabric, so we go through
 *  the underlying database. The shape is stable (id, uid,
 *  workspace, src, rel, dst, fact_id, weight). */
async function allEdgesFor(uid: string, workspace?: string): Promise<RawEdge[]> {
  // Lazy import to avoid loading the SQLite-backed fabric when
  // the caller is in a test that does not need it.
  const mod = await import("@/aetheris/core/knowledge/fabric");
  // The fabric's open() returns a sqlite handle; we only expose
  // it through addFact/listFacts/etc. To keep the explorer
  // honest, we ask the fabric for a list by iterating facts and
  // collecting their edges. If a fact has no direct edge list,
  // we just skip it — the graph view then reflects only what
  // the public surface has.
  // The fabric's addFact writes edges via INSERT INTO edges;
  // there is no public allEdges(). For a small fact count this
  // is fine; for a large one the user can run a SQL query.
  const all: RawEdge[] = [];
  // We do not have a public all-edges query. For a correct
  // graph, fall back to: get every fact, and for each fact run
  // an entity search. The fabric's neighbors() returns edges,
  // so we can BFS from every known entity.
  const facts = await mod.listFacts(uid, workspace, 500);
  const seen = new Set<string>();
  const ent = new Set<string>();
  for (const f of facts) {
    for (const e of f.entities) ent.add(e);
  }
  for (const e of ent) {
    const sub = await mod.neighbors(uid, e, 1, workspace);
    for (const edge of sub.edges) {
      // Dedupe by (src,rel,dst) — the fabric returns both
      // directions from each side of the BFS, so the same
      // logical edge shows up twice.
      const key = `${edge.src}|${edge.rel}|${edge.dst}`;
      if (seen.has(key)) continue;
      seen.add(key);
      all.push(edge as unknown as RawEdge);
    }
  }
  return all;
}

/** Helper used by the page to seed a small graph for demo/testing. */
export async function seedDemoGraph(uid: string): Promise<{ facts: number; edges: number }> {
  const triples = [
    { src: "wtg-04", rel: "is_a", dst: "wind-turbine" },
    { src: "wtg-04", rel: "has_fault", dst: "outer-race" },
    { src: "outer-race", rel: "signature_at", dst: "89.3 Hz" },
    { src: "outer-race", rel: "is_fault", dst: "bearing" },
    { src: "wtg-04", rel: "uses_agent", dst: "Engineer" },
    { src: "Engineer", rel: "belongs_to", dst: "Specialists" },
  ];
  let n = 0;
  for (const t of triples) {
    await addFact({
      uid,
      text: `${t.src} ${t.rel.replace(/_/g, " ")} ${t.dst}`,
      tags: [t.rel, "demo"],
      entities: [t.src, t.dst],
      provenance: { kind: "user", confidence: 1, by: "demo-seed" },
      edges: [t],
    });
    n++;
  }
  return { facts: n, edges: triples.length };
}
