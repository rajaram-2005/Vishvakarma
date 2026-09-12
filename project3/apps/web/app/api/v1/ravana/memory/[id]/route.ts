import { NextResponse } from "next/server";
import { getUserId } from "@/aetheris/lib/user";
import { stampUid } from "@/aetheris/core/ravana/http";
import { remove } from "@/aetheris/core/ravana/memory/manager";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** DELETE /api/v1/ravana/memory/{id} — forget one memory (owner only). */
export async function DELETE(_req: Request, { params }: Ctx) {
  const { uid, isNew } = await getUserId();
  const ok = await remove(uid, (await params).id);
  if (!ok) return stampUid(NextResponse.json({ error: "not found" }, { status: 404 }), isNew, uid);
  return stampUid(NextResponse.json({ deleted: true }), isNew, uid);
}
