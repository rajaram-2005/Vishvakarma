import { NextResponse } from "next/server";
import { getUserId } from "@/aetheris/lib/user";
import { stampUid } from "@/aetheris/core/ravana/http";
import { search } from "@/aetheris/core/ravana/memory/manager";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/v1/ravana/memory/search — retrieval pipeline (spec §11, §15):
 * {query, project_id?, top_k?, types?, min_importance?, tags?} → layered retrieval + rerank.
 */
export async function POST(req: Request) {
  const { uid, isNew } = await getUserId();
  const body = await req.json().catch(() => null);
  const query = typeof body?.query === "string" ? body.query.trim() : "";
  if (!query) return stampUid(NextResponse.json({ error: "query is required" }, { status: 400 }), isNew, uid);
  const hits = await search({
    uid,
    query: query.slice(0, 2000),
    projectId: typeof body?.project_id === "string" ? body.project_id : null,
    topK: Math.min(Number(body?.top_k ?? 8) || 8, 25),
    types: Array.isArray(body?.types) ? body.types.filter((t: unknown) => t === "episodic" || t === "semantic") : undefined,
    minImportance: Number.isFinite(Number(body?.min_importance)) ? Number(body.min_importance) : undefined,
    tags: Array.isArray(body?.tags) ? body.tags.map(String) : undefined,
  });
  return stampUid(
    NextResponse.json({
      query,
      count: hits.length,
      hits: hits.map((h) => ({ memory: h.memory, score: h.score, layer: h.layer, reason: h.reason })),
    }),
    isNew,
    uid,
  );
}
