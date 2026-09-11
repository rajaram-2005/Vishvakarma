import { NextResponse } from "next/server";
import { getUserId, uidCookie } from "@/aetheris/lib/user";
import { ensureScheduler, listSchedules, listScheduleRuns, PRESETS, saveSchedule, SCHEDULE_LIMITS, type Schedule } from "@/aetheris/lib/schedules/engine";
import { describeCron } from "@/aetheris/lib/schedules/cron";
import { listWorkflows } from "@/aetheris/lib/workflows/engine";
import { emailConfigured } from "@/aetheris/lib/auth/deliver";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET → my schedules (+ recent runs, presets, my workflows). POST → create. */
export async function GET() {
  ensureScheduler();
  const { uid, isNew } = await getUserId();
  const [schedules, runs, workflows] = await Promise.all([listSchedules(uid), listScheduleRuns(uid, undefined, 30), listWorkflows(uid)]);
  const res = NextResponse.json({ schedules: schedules.map((s) => ({ ...s, human: describeCron(s.cron) })), runs: runs.map((r) => ({ ...r, output: r.output.slice(0, 600) })), presets: PRESETS, workflows: workflows.map((w) => ({ id: w.id, name: w.name, inputLabel: w.inputLabel })), limits: SCHEDULE_LIMITS, email: emailConfigured(), cronSecretSet: !!process.env.CRON_SECRET });
  if (isNew) res.cookies.set(uidCookie(uid));
  return res;
}
export async function POST(req: Request) {
  ensureScheduler();
  const { uid, isNew } = await getUserId();
  const b = (await req.json().catch(() => ({}))) as Partial<Schedule>;
  try {
    const s = await saveSchedule(uid, b as Parameters<typeof saveSchedule>[1]);
    const res = NextResponse.json({ schedule: { ...s, human: describeCron(s.cron) } }, { status: 201 });
    if (isNew) res.cookies.set(uidCookie(uid));
    return res;
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}
