import { NextResponse } from "next/server";
import { getUserId } from "@/aetheris/lib/user";
import { executeSchedule, getSchedule } from "@/aetheris/lib/schedules/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** POST → run now (manual trigger); returns the run with full output. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { uid } = await getUserId(); const s = await getSchedule((await params).id);
  if (!s || s.uid !== uid) return NextResponse.json({ error: "not found" }, { status: 404 });
  const run = await executeSchedule(s, "manual", { signal: req.signal, origin: new URL(req.url).origin });
  return NextResponse.json({ run }, { status: run.status === "ok" ? 200 : 502 });
}
