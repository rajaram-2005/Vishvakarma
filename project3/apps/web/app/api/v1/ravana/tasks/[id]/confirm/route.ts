import { NextResponse } from "next/server";
import { getUserId } from "@/aetheris/lib/user";
import { stampUid } from "@/aetheris/core/ravana/http";
import { confirmToolRequest, toPublic } from "@/aetheris/core/ravana/engine";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/v1/ravana/tasks/{task_id}/confirm — resolve a confirmation gate.
 * Body: {approve: true, confirmation_token} to allow the requested tool, or {approve: false}
 * to deny it. Tokens are single-use and bound to the task's tool capability (spec §14).
 */
export async function POST(req: Request, { params }: Ctx) {
  const { uid, isNew } = await getUserId();
  const body = await req.json().catch(() => null);
  const approve = body?.approve === true;
  const token = typeof body?.confirmation_token === "string" ? body.confirmation_token : undefined;
  if (approve && !token) return stampUid(NextResponse.json({ error: "confirmation_token is required to approve" }, { status: 400 }), isNew, uid);
  const res = await confirmToolRequest(uid, (await params).id, { approve, confirmationToken: token });
  if (res.error && !res.task) return stampUid(NextResponse.json({ error: res.error }, { status: 404 }), isNew, uid);
  return stampUid(NextResponse.json({ task: toPublic(res.task!) }), isNew, uid);
}
