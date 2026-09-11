import { NextResponse } from "next/server";
import { getUserId, uidCookie } from "@/aetheris/lib/user";
import { clearLessons, forgetLesson, getLessons } from "@/aetheris/lib/agents/lessons";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { uid, isNew } = await getUserId();
  const res = NextResponse.json({ lessons: await getLessons(uid) });
  if (isNew) res.cookies.set(uidCookie(uid));
  return res;
}

export async function DELETE(req: Request) {
  const { uid } = await getUserId();
  const body = await req.json().catch(() => ({})) as { text?: string };
  if (body.text) return NextResponse.json({ lessons: await forgetLesson(uid, body.text) });
  await clearLessons(uid);
  return NextResponse.json({ lessons: [] });
}
