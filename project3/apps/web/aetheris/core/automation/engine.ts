/**
 * Automation Engine (Phase 15) — trigger → condition → agent → verify → action.
 *
 *   Triggers    cron (reuses the schedules cron parser & tick), webhook (POST /api/automations/:id/hook),
 *               device (telemetry threshold on a registered device), twin (bound breach / health drop),
 *               job (an agent job finished), manual
 *   Condition   safe expression over the trigger payload (same DSL as twins: evalExpr) or "always"
 *   Agent       optional: run an agent prompt (via runtime job) with the payload; or skip straight to actions
 *   Verify      optional: a second model pass must answer PASS for the agent output (rubric), or a
 *               numeric expression over payload/twin state must hold; failures block actions
 *   Actions     notify.webhook · notify.email(Resend) · knowledge.remember · device.actuate (physical grant,
 *               pre-issued confirmation stored on the automation) · twin.event · job.submit
 *
 * Every run is persisted with per-stage status; nothing is retried blindly (max 3 attempts, backoff).
 */
import { randomBytes } from "node:crypto";
import { hydrateRouterStores } from "@/aetheris/lib/router/hydrate";
import { resolvedEnv } from "@/aetheris/lib/router/runtimeKeys";
import { store } from "@/aetheris/lib/store";
import { nextRun, parseCron } from "@/aetheris/lib/schedules/cron";
import { route } from "@/aetheris/lib/router/router";
import { record, traced } from "../observability/events";
import { evalExpr, getTwin, twinHealth } from "../twins/twins";
import { actuate, getDevice, telemetryFor } from "../physical/devices";
import { policyCheck } from "../execution/sandbox";
import { authorize, principalFor } from "../policy/permissions";
import { ssrfCheck } from "../security/guard";

export type Trigger = { kind: "cron"; cron: string; tz: string } | { kind: "webhook"; secret: string } | { kind: "device"; deviceId: string; key: string; op: ">" | "<" | ">=" | "<=" | "==" | "!="; value: number; cooldownMin?: number } | { kind: "twin"; twinId: string; minScore?: number } | { kind: "job"; status?: "done" | "failed" } | { kind: "manual" };
export type Condition = { kind: "always" } | { kind: "expr"; expr: string; description?: string };
export type Verify =
  | { kind: "none" }
  | { kind: "rubric"; rubric: string }
  | { kind: "expr"; expr: string }
  /** The agent output must parse as JSON and satisfy this JSON-Schema subset (offline, no model). */
  | { kind: "schema"; schema: unknown }
  /** Run a command in the execution sandbox; failures are fed back to a revise pass, up to maxIterations. */
  | { kind: "tests"; command: string; files?: Record<string, string>; maxIterations?: number };
export type Action = { kind: "webhook"; url: string } | { kind: "email"; to: string } | { kind: "remember"; type: "episodic" | "semantic" | "procedural"; template: string } | { kind: "actuate"; deviceId: string; capability: string; value: number | string | boolean } | { kind: "twin_event"; twinId: string; eventKind: string; template: string } | { kind: "job"; task: string; agents?: string[] };
export interface Automation { id: string; uid: string; name: string; enabled: boolean; trigger: Trigger; condition: Condition; agent?: { prompt: string; agents?: string[]; maxChars?: number }; verify: Verify; actions: Action[]; physicalToken?: string; /** Single-use→stored confirmation for `verify.kind:"tests"`, which executes a command. */ executionToken?: string; createdAt: number; updatedAt: number; nextAt?: number | null; lastAt?: number; lastStatus?: string; lastFiredValue?: number; runs: number }
export interface AutomationRun { id: string; automationId: string; uid: string; startedAt: number; finishedAt?: number; trigger: string; payload: Record<string, unknown>; stages: { stage: "condition" | "agent" | "verify" | "action"; ok: boolean; detail?: string; ms: number }[]; status: "running" | "ok" | "skipped" | "blocked" | "error"; output?: string; error?: string }
const COL = "automations"; const RUNS = "automation_runs"; const LIMITS = { perUser: 60, runsKept: 60, minCronMinutes: 5 };

export function validateAutomation(a: Partial<Automation>): string | null {
  if (!a.name?.trim()) return "name required"; if (!a.trigger) return "trigger required"; if (!a.actions?.length && !a.agent) return "at least one action or an agent step";
  if (a.trigger.kind === "cron") { try { parseCron(a.trigger.cron); } catch (e) { return `cron: ${(e as Error).message}`; } const n1 = nextRun(a.trigger.cron, new Date(), a.trigger.tz); const n2 = n1 && nextRun(a.trigger.cron, new Date(n1.getTime() + 60_000), a.trigger.tz); if (n1 && n2 && (n2.getTime() - n1.getTime()) / 60_000 < LIMITS.minCronMinutes) return `cron interval under ${LIMITS.minCronMinutes} minutes`; }
  if (a.condition?.kind === "expr") { try { evalExpr(a.condition.expr, new Proxy({}, { get: () => 1 }) as Record<string, number>); } catch (e) { return `condition: ${(e as Error).message}`; } }
  if (a.verify?.kind === "schema" && (typeof a.verify.schema !== "object" || a.verify.schema === null)) return "verify.schema must be a JSON-Schema object";
  if (a.verify?.kind === "tests") {
    if (!a.verify.command?.trim()) return "verify.command required";
    const refused = policyCheck(a.verify.command); if (refused) return `verify.command would be refused by the sandbox: ${refused}`;
    if (!a.executionToken) return "verify.kind:\"tests\" runs a command, so it needs an executionToken (confirm execution:server-sandbox in /api/permissions and store the token)";
  }
  if ((a.actions ?? []).some((x) => x.kind === "actuate") && !a.physicalToken) return "device.actuate actions need a physicalToken (confirm the capability in /api/permissions and store the token)";
  for (const x of a.actions ?? []) if (x.kind === "webhook" && !/^https:\/\//.test(x.url)) return "webhook url must be https";
  return null;
}
export const listAutomations = async (uid: string) => Object.values(await store.all<Automation>(COL)).filter((a) => a.uid === uid).sort((a, b) => b.updatedAt - a.updatedAt);
export const getAutomation = (id: string) => store.get<Automation>(COL, id);
export async function saveAutomation(uid: string, input: Partial<Automation> & Pick<Automation, "name" | "trigger">, id?: string): Promise<Automation> {
  const err = validateAutomation(input); if (err) throw new Error(err);
  for (const x of input.actions ?? []) if (x.kind === "webhook") { const ss = await ssrfCheck(x.url); if (!ss.ok) throw new Error(`webhook url rejected: ${ss.reason}`); }
  const cur = id ? await getAutomation(id) : undefined; if (id && (!cur || cur.uid !== uid)) throw new Error("not found");
  if (!cur && (await listAutomations(uid)).length >= LIMITS.perUser) throw new Error(`limit of ${LIMITS.perUser} automations`);
  const a: Automation = { id: cur?.id ?? randomBytes(5).toString("hex"), uid, name: input.name.slice(0, 80), enabled: input.enabled ?? cur?.enabled ?? true, trigger: input.trigger.kind === "webhook" && !input.trigger.secret ? { kind: "webhook", secret: randomBytes(12).toString("base64url") } : input.trigger, condition: input.condition ?? { kind: "always" }, agent: input.agent, verify: input.verify ?? { kind: "none" }, actions: input.actions ?? [], physicalToken: input.physicalToken ?? cur?.physicalToken, executionToken: input.executionToken ?? cur?.executionToken, createdAt: cur?.createdAt ?? Date.now(), updatedAt: Date.now(), runs: cur?.runs ?? 0, lastAt: cur?.lastAt, lastStatus: cur?.lastStatus, lastFiredValue: cur?.lastFiredValue };
  a.nextAt = a.enabled && a.trigger.kind === "cron" ? nextRun(a.trigger.cron, new Date(), a.trigger.tz)?.getTime() ?? null : null;
  await store.set(COL, a.id, a); return a;
}
export async function deleteAutomation(uid: string, id: string) { const a = await getAutomation(id); if (!a || a.uid !== uid) return false; await store.remove(COL, id); return true; }
export async function listRuns(uid: string, automationId?: string, limit = 50) { return Object.values(await store.all<AutomationRun>(RUNS)).filter((r) => r.uid === uid && (!automationId || r.automationId === automationId)).sort((a, b) => b.startedAt - a.startedAt).slice(0, limit); }

const flatten = (o: Record<string, unknown>, prefix = "", out: Record<string, number> = {}) => { for (const [k, v] of Object.entries(o)) { const key = prefix ? `${prefix}_${k}` : k; if (typeof v === "number") out[key] = v; else if (typeof v === "boolean") out[key] = v ? 1 : 0; else if (v && typeof v === "object" && !Array.isArray(v)) flatten(v as Record<string, unknown>, key, out); } return out; };
const fill = (tpl: string, payload: Record<string, unknown>, output?: string) => tpl.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k: string) => k === "output" ? (output ?? "") : String(k.split(".").reduce<unknown>((o, p) => (o && typeof o === "object" ? (o as Record<string, unknown>)[p] : undefined), payload) ?? ""));

/** Run one automation now with a payload. */
export async function fire(a: Automation, trigger: string, payload: Record<string, unknown>, _opts: { origin?: string } = {}): Promise<AutomationRun> {
  const run: AutomationRun = { id: randomBytes(6).toString("hex"), automationId: a.id, uid: a.uid, startedAt: Date.now(), trigger, payload, stages: [], status: "running" };
  await store.set(RUNS, run.id, run);
  const stage = async <T>(name: AutomationRun["stages"][number]["stage"], fn: () => Promise<{ ok: boolean; detail?: string; value?: T }>) => { const t0 = Date.now(); try { const r = await fn(); run.stages.push({ stage: name, ok: r.ok, detail: r.detail?.slice(0, 400), ms: Date.now() - t0 }); return r; } catch (e) { run.stages.push({ stage: name, ok: false, detail: (e as Error).message.slice(0, 400), ms: Date.now() - t0 }); return { ok: false, detail: (e as Error).message }; } };
  const vars = flatten(payload); let output: string | undefined;
  await traced({ type: "schedule", uid: a.uid, capability: `automation:${a.id}`, detail: `${a.name} (${trigger})` }, async () => {
    const cond = await stage("condition", async () => a.condition.kind === "always" ? { ok: true, detail: "always" } : { ok: evalExpr(a.condition.expr, vars) !== 0, detail: a.condition.expr });
    if (!cond.ok) { run.status = "skipped"; return; }
    if (a.agent) {
      const ag = await stage<string>("agent", async () => { const r = await route({ messages: [{ role: "system", content: "You are an Aetheris automation agent. Be concise, factual, and act only on the payload given. Output the result the downstream actions need." }, { role: "user", content: `${fill(a.agent!.prompt, payload)}\n\nPayload:\n${JSON.stringify(payload, null, 1).slice(0, 6000)}` }], allowKeyless: true, maxTokens: 1200 }); return { ok: true, detail: `${r.provider}/${r.model}`, value: r.content.slice(0, a.agent!.maxChars ?? 8000) }; });
      if (!ag.ok) { run.status = "error"; run.error = ag.detail; return; } output = ag.value;
    }
    const ver = await stage("verify", async () => {
      const cfg = a.verify; // narrowed once: TS loses the narrowing across the closure otherwise
      if (cfg.kind === "none") return { ok: true, detail: "no verification configured" };
      if (cfg.kind === "expr") return { ok: evalExpr(cfg.expr, vars) !== 0, detail: cfg.expr };
      if (cfg.kind === "schema") {
        const { extractJson, validateSchema } = await import("../verification/verify");
        const { value, found, error } = extractJson(output ?? "");
        if (!found) return { ok: false, detail: `agent output is not JSON: ${error}` };
        const v = validateSchema(value, cfg.schema);
        if (!v.schemaOk) return { ok: false, detail: `automation misconfigured: ${v.issues[0]?.message}` };
        return { ok: v.valid, detail: v.valid ? "output matches the schema" : v.issues.slice(0, 3).map((i) => `${i.path || "/"} ${i.message}`).join("; ") };
      }
      if (cfg.kind === "tests") {
        // Executing a command is full_workspace, so it needs the same confirmation a manual run needs.
        const dec = authorize({ principal: principalFor(a.uid), capabilityId: "execution:server-sandbox", required: "full_workspace", requiresConfirmation: true, confirmationToken: a.executionToken });
        if (!dec.allow) return { ok: false, detail: `blocked: ${dec.reason}` };
        const { verifyWithTests } = await import("../verification/verify");
        const loop = await verifyWithTests({
          command: cfg.command,
          files: cfg.files,
          maxIterations: cfg.maxIterations,
          revise: async ({ stdout, stderr, files }) => {
            const r = await route({ messages: [{ role: "system", content: "A test command failed. Reply with ONLY the full corrected contents of the file that must change, as JSON: {\"<filename>\": \"<contents>\"}. No prose." }, { role: "user", content: `Command: ${cfg.command}\n\nstdout:\n${stdout.slice(-4000)}\n\nstderr:\n${stderr.slice(-4000)}\n\nFiles:\n${JSON.stringify(files).slice(0, 6000)}` }], allowKeyless: true, maxTokens: 1200, temperature: 0 });
            const { extractJson } = await import("../verification/verify");
            const parsed = extractJson(r.content);
            return parsed.found && parsed.value && typeof parsed.value === "object" ? (parsed.value as Record<string, string>) : null;
          },
          meta: { uid: a.uid, capability: `automation:${a.id}` },
        });
        return { ok: loop.ok, detail: `${loop.stoppedBecause} after ${loop.iterations} attempt(s)${loop.finalOutput ? ` — ${loop.finalOutput.slice(-200)}` : ""}` };
      }
      const r = await route({ messages: [{ role: "system", content: "You are a strict verifier. Reply with exactly PASS or FAIL: <reason>." }, { role: "user", content: `Rubric: ${cfg.rubric}\n\nPayload: ${JSON.stringify(payload).slice(0, 3000)}\n\nOutput to verify:\n${output ?? "(no agent output)"}` }], allowKeyless: true, maxTokens: 120, temperature: 0 });
      return { ok: /^\s*PASS/i.test(r.content), detail: r.content.slice(0, 200) };
    });
    if (!ver.ok) { run.status = "blocked"; return; }
    for (const act of a.actions) {
      await stage("action", async () => {
        await hydrateRouterStores(); // hosted: refresh runtime keys (TTL-gated; no-op on files)
        switch (act.kind) {
          case "webhook": { const r = await fetch(act.url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ automation: { id: a.id, name: a.name }, run: { id: run.id, trigger, payload, output } , text: `*${a.name}*\n${output ?? JSON.stringify(payload).slice(0, 1500)}`, content: (output ?? JSON.stringify(payload)).slice(0, 1900) }), signal: AbortSignal.timeout(15_000) }); return { ok: r.ok, detail: `${act.kind} ${new URL(act.url).hostname} ${r.status}` }; }
          case "email": { const resendKey = resolvedEnv("RESEND_API_KEY"); if (!resendKey) return { ok: false, detail: "email not configured (RESEND_API_KEY)" }; const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: process.env.AUTH_EMAIL_FROM ?? "Aetheris <onboarding@resend.dev>", to: [act.to], subject: `[Aetheris] ${a.name}`, text: output ?? JSON.stringify(payload, null, 1) }), signal: AbortSignal.timeout(15_000) }); return { ok: r.ok, detail: `email ${act.to} ${r.status}` }; }
          case "remember": { const { remember } = await import("../memory/memory"); const m = await remember(a.uid, act.type, fill(act.template, payload, output), { source: "agent", ref: `automation:${a.id}`, confidence: 0.75 }); return { ok: !!m, detail: `remembered ${m?.id}` }; }
          case "twin_event": { const t = await getTwin(act.twinId); if (!t || t.uid !== a.uid) return { ok: false, detail: "twin not found" }; t.events.push({ at: Date.now(), kind: act.eventKind, detail: fill(act.template, payload, output).slice(0, 300) }); const { saveTwin } = await import("../twins/twins"); await saveTwin(t); return { ok: true, detail: `twin ${t.name} event` }; }
          case "job": { const { submitJob } = await import("../agents/runtime"); const j = await submitJob({ uid: a.uid, task: fill(act.task, payload, output), agents: act.agents, title: `automation: ${a.name}` }); return { ok: true, detail: `job ${j.id}` }; }
          case "actuate": {
            const d = await getDevice(act.deviceId); if (!d || d.uid !== a.uid) return { ok: false, detail: "device not found" };
            const p = principalFor(a.uid); if (await store.get("physical_optin", a.uid)) p.grants.push("physical");
            const dec = authorize({ principal: p, capabilityId: `device:${d.id}.${act.capability}`, required: "physical", requiresConfirmation: true, confirmationToken: a.physicalToken });
            if (!dec.allow) return { ok: false, detail: `blocked: ${dec.reason}` };
            const r = await actuate(d, act.capability, act.value, { by: `automation:${a.id}` }); return { ok: r.ok, detail: `actuated ${act.capability}=${JSON.stringify(r.value)} verified=${r.verified}` };
          }
        }
      });
    }
    run.status = run.stages.filter((s) => s.stage === "action").every((s) => s.ok) ? "ok" : "error"; run.output = output;
  });
  run.finishedAt = Date.now(); await store.set(RUNS, run.id, run);
  const mine = await listRuns(a.uid, a.id, 1000); for (const old of mine.slice(LIMITS.runsKept)) await store.remove(RUNS, old.id);
  await store.update<Automation>(COL, a.id, (cur) => ({ ...(cur ?? a), runs: (cur?.runs ?? 0) + 1, lastAt: run.startedAt, lastStatus: run.status, nextAt: (cur ?? a).enabled && a.trigger.kind === "cron" ? nextRun(a.trigger.cron, new Date(), a.trigger.tz)?.getTime() ?? null : null }));
  record({ type: "schedule", uid: a.uid, capability: `automation:${a.id}.run`, ok: run.status === "ok" || run.status === "skipped", detail: `${a.name}: ${run.status}` });
  return run;
}

/** Pure: does a device trigger fire for a value, honouring edge detection (tested). */
export function deviceTriggerFires(t: Extract<Trigger, { kind: "device" }>, value: number, lastFired?: number, lastAt?: number, now = Date.now()) {
  const hit = t.op === ">" ? value > t.value : t.op === "<" ? value < t.value : t.op === ">=" ? value >= t.value : t.op === "<=" ? value <= t.value : t.op === "==" ? value === t.value : value !== t.value;
  if (!hit) return false; if (lastAt && now - lastAt < (t.cooldownMin ?? 10) * 60_000) return false; if (lastFired !== undefined && lastFired === value) return false; return true;
}
/** Scheduler tick: cron, device and twin triggers. */
export async function tickAutomations(now = Date.now(), origin?: string) {
  const all = Object.values(await store.all<Automation>(COL)).filter((a) => a.enabled); const ran: string[] = [];
  for (const a of all) {
    try {
      if (a.trigger.kind === "cron" && a.nextAt !== null && a.nextAt !== undefined && a.nextAt <= now) { await fire(a, "cron", { at: now }, { origin }); ran.push(a.id); }
      else if (a.trigger.kind === "device") { const last = (await telemetryFor(a.trigger.deviceId)).at(-1); const v = Number(last?.values[a.trigger.key]); if (last && Number.isFinite(v) && deviceTriggerFires(a.trigger, v, a.lastFiredValue, a.lastAt, now)) { await store.update<Automation>(COL, a.id, (c) => ({ ...(c ?? a), lastFiredValue: v })); await fire(a, "device", { device: a.trigger.deviceId, key: a.trigger.key, value: v, values: last.values, at: last.at }, { origin }); ran.push(a.id); } }
      else if (a.trigger.kind === "twin") { const t = await getTwin(a.trigger.twinId); if (t) { const h = twinHealth(t); const min = a.trigger.minScore ?? 60; if (h.score < min && (!a.lastAt || now - a.lastAt > 30 * 60_000)) { await fire(a, "twin", { twin: t.id, name: t.name, score: h.score, breaches: h.breaches, state: t.state }, { origin }); ran.push(a.id); } } }
    } catch (e) { record({ type: "schedule", uid: a.uid, capability: `automation:${a.id}`, ok: false, detail: (e as Error).message }); }
  }
  return ran;
}
/** Called by the agent runtime when a job finishes. */
export async function onJobFinished(uid: string, job: { id: string; title?: string; status: string; result?: string }) {
  const all = Object.values(await store.all<Automation>(COL)).filter((a) => a.enabled && a.uid === uid && a.trigger.kind === "job" && (!a.trigger.status || (a.trigger.status === "done" ? job.status === "done" : job.status !== "done")));
  for (const a of all) await fire(a, "job", { job: job.id, title: job.title, status: job.status, result: (job.result ?? "").slice(0, 4000) });
}
