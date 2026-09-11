import { NextResponse } from "next/server";
import { getUserId } from "@/aetheris/lib/user";
import { deleteWorkflow, getWorkflow, listRuns } from "@/aetheris/lib/workflows/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const { uid } = await getUserId();
  const w = await getWorkflow(id);
  if (!w || (!w.public && w.uid !== uid)) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ workflow: { ...w, mine: w.uid === uid }, runs: await listRuns(uid, id) });
}
export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const { uid } = await getUserId();
  try { return NextResponse.json({ ok: await deleteWorkflow(uid, id) }); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 403 }); }
}
