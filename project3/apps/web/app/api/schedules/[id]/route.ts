import { NextResponse } from "next/server";
import { getUserId } from "@/aetheris/lib/user";
import { deleteSchedule, getSchedule, listScheduleRuns, saveSchedule, type Schedule } from "@/aetheris/lib/schedules/engine";
import { describeCron } from "@/aetheris/lib/schedules/cron";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function GET(_r: Request, { params }: Ctx) {
  const { uid } = await getUserId(); const s = await getSchedule((await params).id);
  if (!s || s.uid !== uid) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ schedule: { ...s, human: describeCron(s.cron) }, runs: await listScheduleRuns(uid, s.id, 50) });
}
/** PATCH partial fields (name, cron, tz, task, deliver, enabled). */
export async function PATCH(req: Request, { params }: Ctx) {
  const { uid } = await getUserId(); const s = await getSchedule((await params).id);
  if (!s || s.uid !== uid) return NextResponse.json({ error: "not found" }, { status: 404 });
  const b = (await req.json().catch(() => ({}))) as Partial<Schedule>;
  try { const next = await saveSchedule(uid, { ...s, ...b }, s.id); return NextResponse.json({ schedule: { ...next, human: describeCron(next.cron) } }); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}
export async function DELETE(_r: Request, { params }: Ctx) {
  const { uid } = await getUserId();
  return NextResponse.json({ ok: await deleteSchedule(uid, (await params).id) });
}
