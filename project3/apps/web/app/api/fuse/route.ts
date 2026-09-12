/**
 * POST /api/fuse
 *   body: { question: string, demo?: boolean, includeVayu?: boolean }
 *
 *   Thin HTTP wrapper around the Fusion Engine. Capability:
 *   fusion:orchestrate. The fusion call itself is read-side;
 *   no policy gate is required beyond the user's session.
 */
import { NextResponse, type NextRequest } from "next/server";
import { fuse } from "@/aetheris/core/orchestration/fusion";
import { getUserId } from "@/aetheris/lib/user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { uid } = await getUserId({ allowAnonymous: false });
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const question = String(body.question ?? "").slice(0, 1000);
  if (!question) return NextResponse.json({ ok: false, error: "empty question" }, { status: 400 });
  const demo = body.demo === true;
  const includeVayu = body.includeVayu === true;
  const result = await fuse({ uid, question, demo, includeVayu });
  return NextResponse.json(result, { status: 200 });
}

export async function GET() {
  return NextResponse.json({ ok: false, error: "use POST" }, { status: 405 });
}
