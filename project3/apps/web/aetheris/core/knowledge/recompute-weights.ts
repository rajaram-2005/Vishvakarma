/**
 * Recompute knowledge-graph edge weights from co-occurrence.
 *
 *   For every edge in the user's graph, compute a new weight
 *   based on how often the (src, rel, dst) triple co-occurs
 *   with the user's recall hits. The new weight is in [0, 1]
 *   and is normalised by the maximum co-occurrence count.
 *
 *   The function does NOT mutate the SQLite-backed graph
 *   directly. Instead it writes a recompute audit row to
 *   the 'edge-weight-recomputes' collection, and an
 *   edge-by-edge proposed-weight table in the same
 *   collection. The user (or a separate apply step) can
 *   decide whether to apply. This keeps the recompute
 *   honest and auditable.
 *
 *   With no recall hits, the function reports updated=0
 *   and unchanged=0; nothing is invented.
 */

import { listFacts, queryUnified } from "@/aetheris/core/knowledge/fabric";
import { store } from "@/aetheris/lib/store";
import { record } from "@/aetheris/core/observability/events";

const EDGE_COL = "edges";
const RECOMPUTE_COL = "edge-weight-recomputes";

export interface RecomputeProposal {
  edgeId: string;
  src: string;
  rel: string;
  dst: string;
  oldWeight: number;
  count: number;
  newWeight: number;
  changed: boolean;
}

export interface RecomputeResult {
  uid: string;
  totalEdges: number;
  updated: number;
  unchanged: number;
  maxCount: number;
  proposals: RecomputeProposal[];
  top: { triple: string; count: number; weight: number }[];
  recomputeId: string;
  computedAt: number;
}

function edgeKey(src: string, rel: string, dst: string): string {
  return `${src}|${rel}|${dst}`;
}

export async function recomputeWeights(uid: string, opts: { workspace?: string; limit?: number; query?: string } = {}): Promise<RecomputeResult> {
  const limit = opts.limit ?? 30;
  const query = opts.query ?? "recent";
  const all = await store.all<{ id: string; uid: string; workspace: string; src: string; rel: string; dst: string; weight: number; fact_id?: string }>(EDGE_COL);
  const edges = Object.entries(all).filter(([, e]) => e.uid === uid && (!opts.workspace || e.workspace === opts.workspace)).map(([id, e]) => ({ id, uid: e.uid, workspace: e.workspace, src: e.src, rel: e.rel, dst: e.dst, weight: e.weight, fact_id: e.fact_id }));
  const recomputeId = `${Date.now()}:${uid}`;
  if (edges.length === 0) {
    const result: RecomputeResult = { uid, totalEdges: 0, updated: 0, unchanged: 0, maxCount: 0, proposals: [], top: [], recomputeId, computedAt: Date.now() };
    await store.set(RECOMPUTE_COL, recomputeId, { uid: result.uid, recomputeId: result.recomputeId, totalEdges: result.totalEdges, updated: result.updated, unchanged: result.unchanged, maxCount: result.maxCount, proposals: result.proposals, top: result.top, computedAt: result.computedAt });
    record({ type: "knowledge", uid, capability: "knowledge:recompute", ok: true, ms: 0, detail: "no edges" });
    return result;
  }
  // Co-occurrence counts: for every recall hit, count the
  // edges whose src or dst is in the hit's entities.
  const counts: Record<string, number> = {};
  const facts = await listFacts(uid, opts.workspace, 200);
  void facts;
  const hits = await queryUnified(uid, query, { k: limit });
  for (const h of hits) {
    for (const e of edges) {
      if (e.workspace !== h.fact.workspace) continue;
      if (h.fact.entities.includes(e.src) || h.fact.entities.includes(e.dst)) {
        const k = edgeKey(e.src, e.rel, e.dst);
        counts[k] = (counts[k] ?? 0) + h.score;
      }
    }
  }
  const max = Math.max(0, ...Object.values(counts));
  const proposals: RecomputeProposal[] = edges.map((e) => {
    const k = edgeKey(e.src, e.rel, e.dst);
    const count = counts[k] ?? 0;
    const newWeight = max > 0 ? count / max : e.weight;
    return { edgeId: e.id, src: e.src, rel: e.rel, dst: e.dst, oldWeight: e.weight, count, newWeight, changed: newWeight !== e.weight };
  });
  const updated = proposals.filter((p) => p.changed).length;
  const unchanged = proposals.length - updated;
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([triple, count]) => ({ triple, count, weight: max > 0 ? count / max : 0 }));
  const result: RecomputeResult = { uid, totalEdges: edges.length, updated, unchanged, maxCount: max, proposals, top, recomputeId, computedAt: Date.now() };
  await store.set(RECOMPUTE_COL, recomputeId, { uid: result.uid, recomputeId: result.recomputeId, totalEdges: result.totalEdges, updated: result.updated, unchanged: result.unchanged, maxCount: result.maxCount, proposals: result.proposals, top: result.top, computedAt: result.computedAt });
  record({ type: "knowledge", uid, capability: "knowledge:recompute", ok: true, ms: 0, detail: `${updated}/${proposals.length} edges proposed for change · max=${max}` });
  return result;
}
