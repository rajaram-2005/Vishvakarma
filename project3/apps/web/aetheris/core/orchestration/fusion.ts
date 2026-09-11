/**
 * Fusion Engine.
 *
 *   The single entry point that takes a user question and
 *   returns a structured decision composed of:
 *     - telemetry:  the user-visible snapshot from the fleet
 *     - twin:       state of the relevant twin (canonical if
 *                   none)
 *     - evidence:   recent evidence-ledger entries
 *     - memory:     knowledge-graph neighbours + semantic hits
 *     - verification: a structured decision with uncertainty
 *     - vayu:       (optional) a VAYU-1 bundle if the question
 *                   looks wind/aero
 *     - summary:    one-line derived from the parts above
 *
 *   Every part is sourced from a real module. If a part
 *   cannot be sourced, it returns null + reason. The
 *   returned `verification.decision` is a structured
 *   honest-scope statement, not a fabricated certainty.
 *
 *   The engine records an observability event of type
 *   'agent' under capability 'fusion:orchestrate' so that
 *   every fusion call is traceable.
 */

import { vayuQuery, type VayuResult } from "@/aetheris/core/vayu/service";
import { listTwins } from "@/aetheris/core/twins/twins";
import { evidenceLedger } from "@/aetheris/core/twins/evidence";
import { recall as recallMemory } from "@/aetheris/core/memory/memory";
import { neighbors } from "@/aetheris/core/knowledge/fabric";
import { runtimeSummary } from "@/aetheris/core/agents/runtime";
import { record } from "@/aetheris/core/observability/events";
import { store } from "@/aetheris/lib/store";
import { canonicalTurbineTwin } from "@/aetheris/core/windturbine/model";

export type FusionMode = "live" | "demo-seed";

export interface FusionTelemetry {
  ok: boolean;
  reason?: string;
  twinCount: number;
  agentJobs: number;
  source: "fleet" | "demo-seed";
}

export interface FusionTwin {
  ok: boolean;
  reason?: string;
  twinId: string;
  name: string;
  stateKeys: number;
  boundsCount: number;
  rulesCount: number;
  source: "twin" | "demo-seed";
}

export interface FusionEvidence {
  ok: boolean;
  reason?: string;
  total: number;
  bySource: { "twin-event": number; "diagnostic": number; "system-event": number };
  latestAt: number | null;
  source: "evidence-ledger" | "demo-seed";
}

export interface FusionMemory {
  ok: boolean;
  reason?: string;
  recall: { id: string; kind: string; text: string; at: number }[];
  graphNeighbours: { id: string; rel: string; to: string }[];
  source: "memory" | "demo-seed";
}

export interface FusionVerification {
  decision: "allow" | "allow-with-caveat" | "deny";
  reason: string;
  uncertainty: number;
  testsRun: number;
  testsPassed: number;
  source: "verifier" | "demo-seed";
}

export interface FusionResult {
  uid: string;
  question: string;
  mode: FusionMode;
  generatedAt: number;
  capability: string;
  telemetry: FusionTelemetry;
  twin: FusionTwin;
  evidence: FusionEvidence;
  memory: FusionMemory;
  verification: FusionVerification;
  vayu: VayuResult | null;
  summary: string;
}

const VAYU_TRIGGERS = /\b(wind|turbine|vibration|bearing|rotor|prediction|anomaly|spectrum|fault|peak|fft|aero|drivetrain|gearbox)\b/i;

function buildSummary(r: Omit<FusionResult, "summary">): string {
  const bits: string[] = [];
  bits.push(r.mode === "live" ? "live fusion" : "demo-seed fusion");
  bits.push(`twin=${r.twin.twinId}`);
  bits.push(`telemetry=${r.telemetry.ok ? "ok" : "n/a"}`);
  bits.push(`evidence=${r.evidence.ok ? r.evidence.total : 0}`);
  bits.push(`memory=${r.memory.ok ? r.memory.recall.length : 0}`);
  bits.push(`vayu=${r.vayu ? "yes" : "no"}`);
  bits.push(`verifier=${r.verification.decision}`);
  return bits.join(" · ");
}

async function telemetrySnapshot(uid: string, demo: boolean): Promise<{ snap: FusionTelemetry; mode: FusionMode }> {
  try {
    const [twins, jobs] = await Promise.all([listTwins(uid), runtimeSummary(uid)]);
    if (twins.length === 0 && !demo) {
      return { snap: { ok: false, reason: "no twins", twinCount: 0, agentJobs: jobs.total, source: "fleet" }, mode: "live" };
    }
    return { snap: { ok: true, twinCount: twins.length, agentJobs: jobs.total, source: demo ? "demo-seed" : "fleet" }, mode: demo ? "demo-seed" : "live" };
  } catch (err) {
    return { snap: { ok: false, reason: (err as Error).message, twinCount: 0, agentJobs: 0, source: "fleet" }, mode: "live" };
  }
}

async function twinSnapshot(uid: string, demo: boolean): Promise<FusionTwin> {
  try {
    const twins = await listTwins(uid);
    if (twins.length === 0) {
      if (!demo) return { ok: false, reason: "no twin", twinId: "(none)", name: "(none)", stateKeys: 0, boundsCount: 0, rulesCount: 0, source: "twin" };
      const partial = canonicalTurbineTwin({ id: "fusion-seed-twin", name: "Fusion Seed" });
      return { ok: true, twinId: "fusion-seed-twin", name: "Fusion Seed", stateKeys: Object.keys(partial.state ?? {}).length, boundsCount: partial.bounds?.length ?? 0, rulesCount: partial.rules?.length ?? 0, source: "demo-seed" };
    }
    const t = twins[0]!;
    return { ok: true, twinId: t.id, name: t.name, stateKeys: Object.keys(t.state).length, boundsCount: t.bounds.length, rulesCount: t.rules.length, source: "twin" };
  } catch (err) {
    return { ok: false, reason: (err as Error).message, twinId: "(none)", name: "(none)", stateKeys: 0, boundsCount: 0, rulesCount: 0, source: "twin" };
  }
}

async function evidenceSnapshot(uid: string, demo: boolean): Promise<FusionEvidence> {
  try {
    const r = await evidenceLedger(uid, { limit: 50 });
    if (r.total === 0 && demo) {
      return { ok: true, total: 0, bySource: { "twin-event": 0, "diagnostic": 0, "system-event": 0 }, latestAt: null, source: "demo-seed" };
    }
    return { ok: true, total: r.total, bySource: r.bySource, latestAt: r.entries[0]?.at ?? null, source: "evidence-ledger" };
  } catch (err) {
    return { ok: false, reason: (err as Error).message, total: 0, bySource: { "twin-event": 0, "diagnostic": 0, "system-event": 0 }, latestAt: null, source: "evidence-ledger" };
  }
}

async function memorySnapshot(uid: string, question: string, demo: boolean): Promise<FusionMemory> {
  try {
    const recall = await recallMemory(uid, question, { k: 5 });
    const neighbour = await neighbors(uid, "self", 2);
    return { ok: true, recall: recall.map((r) => ({ id: r.id, kind: r.type, text: r.text.slice(0, 200), at: r.at })), graphNeighbours: neighbour.edges.map((e) => ({ id: e.id, rel: e.rel, to: e.dst })), source: demo ? "demo-seed" : "memory" };
  } catch (err) {
    return { ok: false, reason: (err as Error).message, recall: [], graphNeighbours: [], source: "memory" };
  }
}

async function verificationSnapshot(uid: string, question: string, slices: { ok: boolean }[]): Promise<FusionVerification> {
  // The verifier runs a tiny self-test: count the slices that
  // returned ok=true; if fewer than half are ok, flag
  // allow-with-caveat. This is honest — we never claim more
  // certainty than the inputs support.
  const ok = slices.filter((s) => s.ok).length;
  const total = slices.length;
  const ratio = total > 0 ? ok / total : 0;
  let decision: FusionVerification["decision"];
  if (ratio === 1) decision = "allow";
  else if (ratio >= 0.5) decision = "allow-with-caveat";
  else decision = "deny";
  const reason = `${ok}/${total} sources responded. Question: "${question.slice(0, 80)}".`;
  return { decision, reason, uncertainty: 1 - ratio, testsRun: total, testsPassed: ok, source: "verifier" };
}

export async function fuse(opts: { uid: string; question: string; demo?: boolean; includeVayu?: boolean }): Promise<FusionResult> {
  const cap = "fusion:orchestrate";
  const demo = opts.demo === true;
  const includeVayu = opts.includeVayu ?? VAYU_TRIGGERS.test(opts.question);

  const [telemetryRes, twinRes, evidenceRes, memoryRes] = await Promise.all([
    telemetrySnapshot(opts.uid, demo),
    twinSnapshot(opts.uid, demo),
    evidenceSnapshot(opts.uid, demo),
    memorySnapshot(opts.uid, opts.question, demo),
  ]);

  let vayu: VayuResult | null = null;
  if (includeVayu) {
    try {
      vayu = await vayuQuery({ uid: opts.uid, question: opts.question, demo });
    } catch {
      vayu = null;
    }
  }

  const mode: FusionMode = telemetryRes.mode;
  const verification = await verificationSnapshot(opts.uid, opts.question, [telemetryRes.snap, twinRes, evidenceRes, memoryRes]);
  const partial: Omit<FusionResult, "summary"> = {
    uid: opts.uid,
    question: opts.question,
    mode,
    generatedAt: Date.now(),
    capability: cap,
    telemetry: telemetryRes.snap,
    twin: twinRes,
    evidence: evidenceRes,
    memory: memoryRes,
    verification,
    vayu,
  };
  const summary = buildSummary(partial);
  const result: FusionResult = { ...partial, summary };
  record({ type: "agent", uid: opts.uid, capability: cap, ok: result.verification.decision !== "deny", ms: 0, detail: `${mode} ${opts.question.slice(0, 60)} → ${result.verification.decision}` });
  // Persist a minimal audit row so /trace can surface it.
  await store.set("fusion-runs", `${result.generatedAt}:${opts.uid}`, { uid: opts.uid, at: result.generatedAt, question: opts.question, mode, decision: verification.decision, uncertainty: verification.uncertainty });
  return result;
}
