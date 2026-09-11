/**
 * Learning API — PBNN pipeline control.
 *   GET    /api/learning        list pipelines + state
 *   POST   /api/learning        push a row {id, at, features, target} OR tick/fit a pipeline
 *   DELETE /api/learning?id=... drop a pipeline from memory
 */
import { NextResponse } from "next/server";
import { getUserId, uidCookie } from "@/aetheris/lib/user";
import { getPipeline, listPipelines, type PipelineConfig } from "@/aetheris/core/learning/pipeline";
import type { PbnnSpec } from "@/aetheris/core/learning/pbnn";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { uid, isNew } = await getUserId();
  const res = NextResponse.json({ pipelines: listPipelines() });
  if (isNew) res.cookies.set(uidCookie(uid));
  return res;
}

export async function POST(req: Request) {
  const { uid, isNew } = await getUserId();
  const body = (await req.json().catch(() => ({}))) as { id?: string; spec?: PbnnSpec; cfg?: Partial<PipelineConfig>; at?: number; features?: Record<string, number>; target?: number; tick?: boolean; force?: boolean };
  if (!body.id || !body.spec) return NextResponse.json({ error: "id and spec are required" }, { status: 400 });
  const p = getPipeline(body.id, { spec: body.spec, ...(body.cfg ?? {}) });
  if (body.at !== undefined && body.features && body.target !== undefined) p.push(body.at, body.features, body.target);
  if (body.tick !== false) {
    const r = p.tick({ uid, force: !!body.force });
    const res = NextResponse.json({ state: p.getState(), spec: p.getSpec(), tick: r });
    if (isNew) res.cookies.set(uidCookie(uid));
    return res;
  }
  const res = NextResponse.json({ state: p.getState(), spec: p.getSpec() });
  if (isNew) res.cookies.set(uidCookie(uid));
  return res;
}

export async function DELETE(req: Request) {
  const { uid, isNew } = await getUserId();
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  // pipeline is process-local; we acknowledge but can't reach into the registry without
  // exposing it. Caller can stop pushing data; on restart it will be empty.
  const res = NextResponse.json({ ok: true, id, note: "pipelines are process-local; the entry will be cleared on next restart" });
  if (isNew) res.cookies.set(uidCookie(uid));
  return res;
}
