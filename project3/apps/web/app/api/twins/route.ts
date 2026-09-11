import { NextResponse } from "next/server";
import { getUserId, uidCookie } from "@/aetheris/lib/user";
import { createTwin, listTwins, twinHealth } from "@/aetheris/core/twins/twins";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
/** GET → my twins with health. POST {name, kind?, deviceIds?, state?, bounds?, rules?, stepSeconds?, relationships?, maintenance?} → create. */
export async function GET() { const { uid, isNew } = await getUserId(); const res = NextResponse.json({ twins: (await listTwins(uid)).map((t) => ({ ...t, history: t.history.slice(-20), health: twinHealth(t) })) }); if (isNew) res.cookies.set(uidCookie(uid)); return res; }
export async function POST(req: Request) { const { uid, isNew } = await getUserId(); const b = (await req.json().catch(() => ({}))) as Parameters<typeof createTwin>[1]; if (!b?.name) return NextResponse.json({ error: "name required" }, { status: 400 }); const t = await createTwin(uid, b); const res = NextResponse.json({ twin: t }, { status: 201 }); if (isNew) res.cookies.set(uidCookie(uid)); return res; }
