import { NextResponse } from "next/server";
import { getUserId, uidCookie } from "@/aetheris/lib/user";
import { DEFAULT_BUDGET, listJobs, runtimeSummary, submitJob } from "@/aetheris/core/agents/runtime";
import { planFor } from "@/aetheris/lib/billing/entitlements";
import { resolveTier } from "@/aetheris/lib/models/tiers";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";

/** GET → my background jobs. POST {task, title?, agents?, budget?, model?} → job (runs in background). */
export async function GET() { const { uid, isNew } = await getUserId(); const res = NextResponse.json({ jobs: (await listJobs(uid)).map((j) => ({ ...j, output: j.output.slice(0, 400), checkpoints: j.checkpoints.slice(-5) })), summary: await runtimeSummary(uid), defaultBudget: DEFAULT_BUDGET }); if (isNew) res.cookies.set(uidCookie(uid)); return res; }
export async function POST(req: Request) {
  const { uid, isNew } = await getUserId();
  const b = (await req.json().catch(() => ({}))) as { task?: string; title?: string; agents?: string[]; budget?: Partial<typeof DEFAULT_BUDGET>; model?: string; workspace?: string };
  if (!b.task?.trim()) return NextResponse.json({ error: "task required" }, { status: 400 });
  const plan = await planFor(uid); const { tier } = resolveTier(b.model, plan.id);
  const job = await submitJob({ uid, task: b.task.slice(0, 20_000), title: b.title, agents: b.agents, budget: b.budget, workspace: b.workspace, policy: { allow: tier.providers, allowKeyless: tier.allowKeyless, maxTokens: tier.maxTokens } });
  const res = NextResponse.json({ job }, { status: 202 }); if (isNew) res.cookies.set(uidCookie(uid)); return res;
}
