/**
 * Scheduled automations — run a workflow (or a single agent prompt) on a cron schedule, keep run
 * history, and deliver results by email / webhook / share link. Free for everyone.
 *
 * Execution model (cloud-friendly, no long-lived process needed):
 *  • `tick()` runs everything that is due. It is invoked (a) by an in-process timer while the server is
 *    up, (b) by GET/POST /api/schedules/tick — point any external cron (GitHub Actions,
 *    cron-job.org, UptimeRobot) at it, optionally with `Authorization: Bearer $CRON_SECRET`.
 *  • Missed runs (server asleep) are caught up once, not replayed N times.
 */
import { randomBytes } from "node:crypto";
import { resolvedEnv } from "@/aetheris/lib/router/runtimeKeys";
import { store } from "@/aetheris/lib/store";
import { record } from "@/aetheris/core/observability/events";
import { agentById, HERMES_BASE } from "@/aetheris/lib/agents/catalog";
import { route } from "@/aetheris/lib/router/router";
import { getWorkflow, runWorkflow } from "@/aetheris/lib/workflows/engine";
import { describeCron, isValidTimeZone, nextRun, parseCron } from "./cron";

export type Delivery =
  | { type: "email"; to: string }
  | { type: "webhook"; url: string }          // POST JSON {schedule, run} — Slack/Discord/Zapier/n8n/WhatsApp-gateway
  | { type: "share" };                         // public read-only page /s/<id> (always available)
export interface Schedule {
  id: string; uid: string; name: string; enabled: boolean;
  cron: string; tz: string;
  task: { kind: "workflow"; workflowId: string; input: string } | { kind: "agent"; agent: string; prompt: string };
  deliver: Delivery[];
  createdAt: number; updatedAt: number;
  nextAt: number | null; lastAt?: number; lastStatus?: "ok" | "error"; lastError?: string; runs: number;
}
export interface ScheduleRun { id: string; scheduleId: string; uid: string; startedAt: number; finishedAt?: number; status: "running" | "ok" | "error"; output: string; error?: string; delivered: { type: string; ok: boolean; detail?: string }[]; shareId?: string; trigger: "cron" | "manual" }

const COL = "schedules"; const RUNS = "schedule_runs";
export const SCHEDULE_LIMITS = { perUser: 50, minIntervalMinutes: 15, runsKept: 50 };
export const PRESETS: { label: string; cron: string }[] = [
  { label: "Every day at 8:00", cron: "0 8 * * *" }, { label: "Weekdays at 9:00", cron: "0 9 * * 1-5" }, { label: "Every Monday at 9:00", cron: "0 9 * * 1" },
  { label: "Every hour", cron: "0 * * * *" }, { label: "Every 30 minutes", cron: "*/30 * * * *" }, { label: "1st of the month at 9:00", cron: "0 9 1 * *" }, { label: "Every evening at 18:30", cron: "30 18 * * *" },
];

// ---- validation ----------------------------------------------------------------------------------
export function validateSchedule(s: Partial<Schedule>): string | null {
  if (!s.name?.trim()) return "name required";
  if (!s.cron) return "cron required";
  let spec; try { spec = parseCron(s.cron); } catch (e) { return `invalid cron: ${(e as Error).message}`; }
  if (spec.min.size > 60 / SCHEDULE_LIMITS.minIntervalMinutes && spec.hour.size === 24) return `minimum interval is ${SCHEDULE_LIMITS.minIntervalMinutes} minutes`;
  if (!s.tz || !isValidTimeZone(s.tz)) return "invalid time zone";
  if (!s.task) return "task required";
  if (s.task.kind === "workflow" && !s.task.workflowId) return "workflow required";
  if (s.task.kind === "agent" && (!agentById(s.task.agent) || !s.task.prompt?.trim())) return "agent and prompt required";
  for (const d of s.deliver ?? []) {
    if (d.type === "email" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.to)) return `invalid email ${d.to}`;
    if (d.type === "webhook" && !/^https:\/\//.test(d.url)) return "webhook must be https";
  }
  return null;
}

// ---- CRUD ------------------------------------------------------------------------------------------
export async function listSchedules(uid: string) { return Object.values(await store.all<Schedule>(COL)).filter((s) => s.uid === uid).sort((a, b) => (a.nextAt ?? Infinity) - (b.nextAt ?? Infinity)); }
export const getSchedule = (id: string) => store.get<Schedule>(COL, id);
export async function saveSchedule(uid: string, input: Partial<Schedule> & Pick<Schedule, "name" | "cron" | "tz" | "task">, id?: string): Promise<Schedule> {
  const err = validateSchedule(input); if (err) throw new Error(err);
  const existing = id ? await getSchedule(id) : undefined;
  if (id && (!existing || existing.uid !== uid)) throw new Error("not found");
  if (!existing && (await listSchedules(uid)).length >= SCHEDULE_LIMITS.perUser) throw new Error(`limit of ${SCHEDULE_LIMITS.perUser} schedules`);
  const deliver = (input.deliver ?? []).length ? input.deliver! : [{ type: "share" as const }];
  const s: Schedule = { id: existing?.id ?? randomBytes(5).toString("hex"), uid, name: input.name.trim().slice(0, 80), enabled: input.enabled ?? existing?.enabled ?? true, cron: input.cron.trim(), tz: input.tz, task: input.task, deliver, createdAt: existing?.createdAt ?? Date.now(), updatedAt: Date.now(), nextAt: null, runs: existing?.runs ?? 0, lastAt: existing?.lastAt, lastStatus: existing?.lastStatus, lastError: existing?.lastError };
  s.nextAt = s.enabled ? nextRun(s.cron, new Date(), s.tz)?.getTime() ?? null : null;
  await store.set(COL, s.id, s); return s;
}
export async function deleteSchedule(uid: string, id: string) { const s = await getSchedule(id); if (!s || s.uid !== uid) return false; await store.remove(COL, id); return true; }
export async function listScheduleRuns(uid: string, scheduleId?: string, limit = 20): Promise<ScheduleRun[]> {
  return Object.values(await store.all<ScheduleRun>(RUNS)).filter((r) => r.uid === uid && (!scheduleId || r.scheduleId === scheduleId)).sort((a, b) => b.startedAt - a.startedAt).slice(0, limit);
}
export const getScheduleRun = (id: string) => store.get<ScheduleRun>(RUNS, id);

// ---- execution -------------------------------------------------------------------------------------
const AUTOMATION_SYSTEM = "You are running as an unattended scheduled automation. Produce the complete deliverable directly (no questions, no preamble, no offers to help further). Use clear headings and keep it skimmable. Include today's date where relevant.";

export async function executeSchedule(s: Schedule, trigger: ScheduleRun["trigger"], opts: { signal?: AbortSignal; origin?: string } = {}): Promise<ScheduleRun> {
  const run: ScheduleRun = { id: randomBytes(6).toString("hex"), scheduleId: s.id, uid: s.uid, startedAt: Date.now(), status: "running", output: "", delivered: [], trigger };
  await store.set(RUNS, run.id, run);
  const today = new Date().toLocaleDateString("en-IN", { timeZone: s.tz, weekday: "long", year: "numeric", month: "long", day: "numeric" });
  try {
    if (s.task.kind === "workflow") {
      const wf = await getWorkflow(s.task.workflowId);
      if (!wf || (!wf.public && wf.uid !== s.uid)) throw new Error("workflow not found");
      const r = await runWorkflow(wf, s.uid, s.task.input.replace(/\{\{\s*date\s*\}\}/g, today) || today, { onEvent: () => undefined, signal: opts.signal, allowKeyless: true, baseSystem: AUTOMATION_SYSTEM });
      if (r.status === "error") throw new Error(r.error ?? "workflow failed");
      run.output = r.final;
    } else {
      const spec = agentById(s.task.agent)!;
      const r = await route({ messages: [{ role: "system", content: `${AUTOMATION_SYSTEM}\n\n${HERMES_BASE}\n\nROLE: ${spec.name}\n${spec.system}` }, { role: "user", content: `Today is ${today}.\n\n${s.task.prompt.replace(/\{\{\s*date\s*\}\}/g, today)}` }], allowKeyless: true, signal: opts.signal, maxTokens: 2000 });
      run.output = r.content;
    }
    run.status = "ok";
  } catch (e) {
    run.status = "error"; run.error = (e as Error).message.slice(0, 500);
  }
  run.finishedAt = Date.now();
  // deliver (share link first so email/webhook can include it)
  if (run.status === "ok") {
    for (const d of s.deliver) {
      try {
        if (d.type === "share") { run.shareId = await publishShare(s, run); run.delivered.push({ type: "share", ok: true, detail: `/s/${run.shareId}` }); }
        else if (d.type === "email") { run.delivered.push({ type: "email", ok: await sendEmail(d.to, `[Aetheris] ${s.name} — ${today}`, run.output, opts.origin && run.shareId ? `${opts.origin}/s/${run.shareId}` : undefined), detail: d.to }); }
        else if (d.type === "webhook") { const r = await fetch(d.url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ schedule: { id: s.id, name: s.name }, run: { id: run.id, startedAt: run.startedAt, output: run.output, shareUrl: opts.origin && run.shareId ? `${opts.origin}/s/${run.shareId}` : undefined }, text: `*${s.name}* — ${today}\n\n${run.output.slice(0, 3500)}`, content: run.output.slice(0, 1900) }), signal: AbortSignal.timeout(15_000) }); run.delivered.push({ type: "webhook", ok: r.ok, detail: `${new URL(d.url).hostname} ${r.status}` }); }
      } catch (e) { run.delivered.push({ type: d.type, ok: false, detail: (e as Error).message.slice(0, 200) }); }
    }
  }
  record({ type: "schedule", uid: s.uid, capability: `schedule:${s.id}`, ok: run.status === "ok", ms: (run.finishedAt ?? Date.now()) - run.startedAt, detail: run.error ?? `${s.name} (${trigger})`, meta: { delivered: run.delivered } });
  await store.set(RUNS, run.id, run);
  // trim history
  const mine = (await listScheduleRuns(s.uid, s.id, 1000)); for (const old of mine.slice(SCHEDULE_LIMITS.runsKept)) await store.remove(RUNS, old.id);
  // update schedule
  await store.update<Schedule>(COL, s.id, (cur) => ({ ...(cur ?? s), runs: (cur?.runs ?? s.runs) + 1, lastAt: run.startedAt, lastStatus: run.status === "ok" ? "ok" : "error", lastError: run.error, nextAt: (cur?.enabled ?? s.enabled) ? nextRun(s.cron, new Date(), s.tz)?.getTime() ?? null : null }));
  return run;
}

async function publishShare(s: Schedule, run: ScheduleRun): Promise<string> {
  const id = randomBytes(6).toString("base64url");
  await store.set("shares", id, { id, uid: s.uid, title: `${s.name} — ${new Date(run.startedAt).toLocaleDateString("en-IN", { timeZone: s.tz })}`, messages: [{ role: "user", content: s.task.kind === "agent" ? s.task.prompt : `Workflow: ${s.task.input}` }, { role: "assistant", content: run.output, provider: "aetheris-schedule" }], createdAt: Date.now(), views: 0 });
  return id;
}
async function sendEmail(to: string, subject: string, body: string, link?: string): Promise<boolean> {
  const resendKey = resolvedEnv("RESEND_API_KEY");
  if (!resendKey) throw new Error("Email not configured on this server (add a Resend key in Settings → API keys, or set RESEND_API_KEY). Use a share link or webhook instead.");
  const html = `<div style="font-family:system-ui;max-width:680px;margin:auto"><pre style="white-space:pre-wrap;font-family:inherit;line-height:1.5">${body.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c]!)}</pre>${link ? `<p><a href="${link}">Open in Aetheris</a></p>` : ""}<p style="color:#888;font-size:12px">Sent by an Aetheris scheduled automation.</p></div>`;
  const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: process.env.AUTH_EMAIL_FROM ?? "Aetheris <onboarding@resend.dev>", to: [to], subject, html, text: body }), signal: AbortSignal.timeout(15_000) });
  if (!r.ok) throw new Error(`email failed (${r.status})`);
  return true;
}

// ---- ticking ---------------------------------------------------------------------------------------
let ticking = false;
/** Run every enabled schedule whose nextAt has passed. Returns what ran. */
export async function tick(now = Date.now(), origin?: string): Promise<{ ran: { id: string; name: string; status: string }[]; skipped: number }> {
  if (ticking) return { ran: [], skipped: 0 };
  ticking = true;
  const ran: { id: string; name: string; status: string }[] = []; let skipped = 0;
  try {
    try { const { sweepHealth } = await import("@/aetheris/core/mcp/gateway"); await sweepHealth(); } catch { /* health sweep is best-effort */ }
    try { const { syncAllTwins } = await import("@/aetheris/core/twins/twins"); await syncAllTwins(); } catch { /* twin sync is best-effort */ }
    try { const { tickAutomations } = await import("@/aetheris/core/automation/engine"); await tickAutomations(now, origin); } catch { /* automations are best-effort */ }
    const due = Object.values(await store.all<Schedule>(COL)).filter((s) => s.enabled && s.nextAt !== null && s.nextAt <= now);
    for (const s of due) {
      // claim first (so parallel tickers don't double-run), then execute
      const claimed = await store.update<Schedule>(COL, s.id, (cur) => { if (!cur || cur.nextAt === null || cur.nextAt > now) { skipped++; return cur ?? s; } return { ...cur, nextAt: nextRun(cur.cron, new Date(now), cur.tz)?.getTime() ?? null }; });
      if (claimed.nextAt === s.nextAt) continue;
      const run = await executeSchedule(s, "cron", { origin });
      ran.push({ id: s.id, name: s.name, status: run.status });
    }
  } finally { ticking = false; }
  return { ran, skipped };
}

/** In-process timer (best effort; complements the external /api/schedules/tick). */
const g = globalThis as unknown as { __aetherisScheduler?: ReturnType<typeof setInterval> };
export function ensureScheduler() {
  if (g.__aetherisScheduler || process.env.AETHERIS_SCHEDULER === "0") return;
  g.__aetherisScheduler = setInterval(() => { tick().catch((e) => console.warn("[aetheris] scheduler tick failed", (e as Error).message)); }, 60_000);
  if (typeof g.__aetherisScheduler.unref === "function") g.__aetherisScheduler.unref();
}

export const describe = describeCron;
