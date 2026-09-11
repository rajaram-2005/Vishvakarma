import { NextResponse } from "next/server";
import { getSessionAccount } from "@/aetheris/lib/auth/accounts";
import { store } from "@/aetheris/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cloud sync for signed-in accounts. The client keeps localStorage as the working copy and
 * merges with this blob by (id, updatedAt); the server is a simple last-writer-wins per item.
 */
import { mergeSync, type SyncBlob } from "@/aetheris/lib/sync";
const COL = "sync";
const MAX_BYTES = 8_000_000;

export async function GET() {
  const acc = await getSessionAccount();
  if (!acc) return NextResponse.json({ error: "sign in to sync" }, { status: 401 });
  const blob = (await store.get<SyncBlob>(COL, acc.id)) ?? { convos: {}, projects: {}, memory: [], settings: {}, rev: 0, at: 0 };
  return NextResponse.json(blob);
}

export async function PUT(req: Request) {
  const acc = await getSessionAccount();
  if (!acc) return NextResponse.json({ error: "sign in to sync" }, { status: 401 });
  const raw = await req.text();
  if (raw.length > MAX_BYTES) return NextResponse.json({ error: "sync payload too large" }, { status: 413 });
  const inc = JSON.parse(raw) as Partial<SyncBlob>;
  const merged = await store.update<SyncBlob>(COL, acc.id, (cur) => mergeSync(cur, inc));
  return NextResponse.json({ rev: merged.rev, at: merged.at, count: Object.keys(merged.convos).length });
}

export async function DELETE() {
  const acc = await getSessionAccount();
  if (!acc) return NextResponse.json({ error: "sign in" }, { status: 401 });
  await store.remove(COL, acc.id);
  return NextResponse.json({ ok: true });
}
