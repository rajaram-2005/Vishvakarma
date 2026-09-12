/**
 * Lab Experiment History.
 *
 *   A read-side store for every lab run. Each experiment is
 *   recorded with: id, uid, at, language, description, source
 *   (truncated), result (ok, stoppedBecause, output snippet),
 *   and duration (ms). The store is the production
 *   `lab-history` collection; nothing here is fabricated.
 *
 *   The page exposes the experiment list newest-first, a
 *   per-experiment detail view, and a small summary rollup
 *   (ok / fail, by language, p50 / p95 latency).
 */

import { store } from "@/aetheris/lib/store";
import { runInLab, type LabLanguage, type LabRequest, type LabResult } from "@/aetheris/core/lab/codesandbox";
import { DEFAULT_GRANTS, type Principal } from "@/aetheris/core/policy/permissions";
import { record } from "@/aetheris/core/observability/events";

export interface LabExperiment {
  id: string;
  uid: string;
  at: number;
  language: LabLanguage;
  description: string;
  source: string; // truncated
  ok: boolean;
  stoppedBecause: LabResult["stoppedBecause"];
  outputSnippet: string; // truncated
  durationMs: number;
  /** Confirmation token used (if any). */
  confirmationToken?: string;
}

const COLLECTION = "lab-history";
const MAX_SOURCE = 4_000;
const MAX_OUTPUT = 1_000;

function snippet(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "…(truncated)" : s;
}

function principalFor(uid: string): Principal {
  return { uid, grants: [...DEFAULT_GRANTS] };
}

export async function runAndRecord(opts: { uid: string; description: string; language: LabLanguage; source: string; confirmationToken?: string; testCommand?: string; timeoutMs?: number }): Promise<LabExperiment> {
  const t0 = Date.now();
  const req: LabRequest = {
    principal: principalFor(opts.uid),
    description: opts.description.slice(0, 200),
    language: opts.language,
    source: opts.source.slice(0, 32_000),
    confirmationToken: opts.confirmationToken,
    testCommand: opts.testCommand,
    timeoutMs: opts.timeoutMs,
    runtime: "sandbox",
  };
  const result = await runInLab(req, { uid: opts.uid });
  const exp: LabExperiment = {
    id: `lab${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    uid: opts.uid,
    at: Date.now(),
    language: opts.language,
    description: opts.description.slice(0, 200),
    source: snippet(opts.source, MAX_SOURCE),
    ok: result.ok,
    stoppedBecause: result.stoppedBecause,
    outputSnippet: snippet(result.output, MAX_OUTPUT),
    durationMs: Date.now() - t0,
    confirmationToken: opts.confirmationToken,
  };
  await store.set(COLLECTION, exp.id, exp);
  record({ type: "execution", uid: opts.uid, capability: `lab:${exp.id}.run`, ok: exp.ok, ms: exp.durationMs, detail: exp.stoppedBecause });
  return exp;
}

export async function listExperiments(uid: string, opts: { limit?: number; language?: LabLanguage } = {}): Promise<LabExperiment[]> {
  const all = await store.all<LabExperiment>(COLLECTION);
  const out: LabExperiment[] = [];
  for (const [, v] of Object.entries(all)) {
    if (v.uid !== uid) continue;
    if (opts.language && v.language !== opts.language) continue;
    out.push(v);
  }
  out.sort((a, b) => b.at - a.at);
  return out.slice(0, opts.limit ?? 50);
}

export async function getExperiment(uid: string, id: string): Promise<LabExperiment | null> {
  const e = await store.get<LabExperiment>(COLLECTION, id);
  if (!e || e.uid !== uid) return null;
  return e;
}

export interface LabSummary {
  total: number;
  okCount: number;
  failCount: number;
  byLanguage: Record<string, number>;
  byStopReason: Record<string, number>;
  durationP50: number;
  durationP95: number;
  generatedAt: number;
}

export function summarise(experiments: LabExperiment[]): LabSummary {
  const byLanguage: Record<string, number> = {};
  const byStopReason: Record<string, number> = {};
  for (const e of experiments) {
    byLanguage[e.language] = (byLanguage[e.language] ?? 0) + 1;
    byStopReason[e.stoppedBecause] = (byStopReason[e.stoppedBecause] ?? 0) + 1;
  }
  const sorted = [...experiments].map((e) => e.durationMs).sort((a, b) => a - b);
  const p50 = sorted.length ? sorted[Math.floor(sorted.length * 0.5)] ?? 0 : 0;
  const p95 = sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0 : 0;
  return {
    total: experiments.length,
    okCount: experiments.filter((e) => e.ok).length,
    failCount: experiments.filter((e) => !e.ok).length,
    byLanguage,
    byStopReason,
    durationP50: p50,
    durationP95: p95,
    generatedAt: Date.now(),
  };
}
