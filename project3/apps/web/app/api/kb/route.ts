import { NextResponse } from "next/server";
import { getUserId, uidCookie } from "@/aetheris/lib/user";
import { createKb, KB_LIMITS, listKbs } from "@/aetheris/lib/kb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET → my knowledge bases (without chunks). POST {name, description?} → new KB. */
export async function GET() {
  const { uid, isNew } = await getUserId();
  const res = NextResponse.json({ kbs: await listKbs(uid), limits: KB_LIMITS });
  if (isNew) res.cookies.set(uidCookie(uid));
  return res;
}
export async function POST(req: Request) {
  const { uid, isNew } = await getUserId();
  const b = (await req.json().catch(() => ({}))) as { name?: string; description?: string };
  if (!b.name?.trim()) return NextResponse.json({ error: "name required" }, { status: 400 });
  if ((await listKbs(uid)).length >= KB_LIMITS.kbsPerUser) return NextResponse.json({ error: `Limit of ${KB_LIMITS.kbsPerUser} knowledge bases reached` }, { status: 400 });
  const kb = await createKb(uid, b.name, b.description ?? "");
  const { chunks: _c, ...lite } = kb;
  const res = NextResponse.json({ kb: lite }, { status: 201 });
  if (isNew) res.cookies.set(uidCookie(uid));
  return res;
}
