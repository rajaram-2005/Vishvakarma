import { NextResponse } from "next/server";
import { getUserId, uidCookie } from "@/aetheris/lib/user";
import { ensureTemplates, listWorkflows, saveWorkflow } from "@/aetheris/lib/workflows/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { uid, isNew } = await getUserId();
  await ensureTemplates();
  const res = NextResponse.json({ workflows: (await listWorkflows(uid)).map((w) => ({ ...w, mine: w.uid === uid })) });
  if (isNew) res.cookies.set(uidCookie(uid));
  return res;
}

export async function POST(req: Request) {
  const { uid, isNew } = await getUserId();
  const body = await req.json().catch(() => null);
  if (!body?.name || !Array.isArray(body.steps)) return NextResponse.json({ error: "name and steps required" }, { status: 400 });
  try { const res = NextResponse.json({ workflow: await saveWorkflow(uid, body, body.id) }); if (isNew) res.cookies.set(uidCookie(uid)); return res; }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}
