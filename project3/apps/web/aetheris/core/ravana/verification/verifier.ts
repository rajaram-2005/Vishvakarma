/**
 * RAVANA · Verifier (spec §9) — verification is mandatory, not optional.
 *
 *   Generate → Test → Critique → Verify → Correct → Return
 *
 * v0.1 verification strategies:
 *   tests              code nodes: run the artifact through the sandboxed python tool
 *   structural         non-empty, well-formed checks (plans, JSON artifacts)
 *   selfcheck          same-role model critique (fast lane)
 *   independent_review second model (routed AWAY from the generator) reviews the answer
 *
 * The mesh's `avoidModels` mechanism makes reviewer independence a routing property; the result
 * records which provider actually reviewed, so `independent` is checkable, never asserted.
 */
import { parseVerdict } from "../../verification/verify";
import { OUT_REVIEW } from "../models/base";
import type { LlmLike } from "../models/base";
import type { RavanaFinding, RavanaKind, RavanaNodeType, RavanaPlanNode, RavanaTask, RavanaVerification, RavanaVerifyStrategy } from "../types";
import type { ToolGate } from "../agents/executor";

export interface VerifierHooks {
  llm: LlmLike;
  emit: (type: "verification.started" | "verification.completed", payload?: Record<string, unknown>) => void;
  signal?: AbortSignal;
}

/** Strategy chosen per node type / kind. */
export function nodeStrategy(node: RavanaPlanNode): RavanaVerifyStrategy {
  if (node.type === "code") return "tests";
  if (node.type === "research" || node.type === "understand") return "structural";
  return "structural";
}

/** Strategy for the final deliverable, per task kind. */
export function finalStrategy(task: RavanaTask): RavanaVerifyStrategy {
  if (task.engineResolved === "preview") return "structural";
  switch (task.kind) {
    case "analysis":
    case "math":
    case "research":
      return "independent_review";
    case "chat":
    case "vision":
    case "build":
      return "selfcheck";
    case "coding":
      return "structural"; // code is verified by executed tests, not by opinion
  }
}

/** Check a node's output. For code nodes this actually runs the produced files through the
 * sandboxed python tool (tests strategy) — tool events land on the execution trace. */
export async function checkNode(
  node: RavanaPlanNode,
  produced: { output: string; files: Record<string, string> },
  rt: { tools: ToolGate; signal?: AbortSignal; preview: boolean },
): Promise<{ verification: RavanaVerification; fixHint?: string }> {
  const strategy = nodeStrategy(node);
  if (node.type === "code" && strategy === "tests") {
    const files = produced.files ?? {};
    const entry = Object.keys(files).find((f) => /^main\.py$/.test(f)) ?? Object.keys(files).find((f) => f.endsWith(".py")) ?? Object.keys(files)[0];
    if (!files[entry]) {
      const verification: RavanaVerification = { strategy, status: "failed", findings: [{ severity: "blocker", text: "code step produced no files to test" }], attempts: 1 };
      return { verification, fixHint: "Return files with a runnable python entry (main.py preferred) in the JSON output." };
    }
    const run = await rt.tools.run("python.execute", { files, file: entry, timeoutMs: 20_000 }, { purpose: "verification" });
    const ok = run.ok && (run.data as { exitCode?: number | null } | undefined)?.exitCode === 0;
    const findings: RavanaFinding[] = ok ? [] : [{ severity: "blocker", text: `execution failed (exit ${(run.data as { exitCode?: number | null } | undefined)?.exitCode ?? "?"}): ${(run.error ?? run.output ?? "").slice(0, 900)}` }];
    return {
      verification: { strategy, status: ok ? "passed" : "failed", findings, attempts: 1, detail: ok ? `python.execute exited 0 — ${run.summary}` : run.summary },
      fixHint: ok ? undefined : "Fix the code so `python3 <entry>` exits 0. Return the corrected files as JSON.",
    };
  }
  // structural
  const has = produced.output.trim().length > 0 || Object.keys(produced.files).length > 0;
  const findings: RavanaFinding[] = has ? [] : [{ severity: "major", text: "step produced no output" }];
  return {
    verification: { strategy, status: has ? "passed" : "failed", findings, attempts: 1 },
    fixHint: has ? undefined : "Produce a concrete output for this step.",
  };
}

const SELFCHECK_SYSTEM =
  "You are RAVANA's internal critic. Review the deliverable for factual errors, unsupported claims, contradictions and ignored instructions. Reply with JSON only:\n{\"pass\":true|false,\"score\":0-100,\"findings\":[{\"severity\":\"blocker\"|\"major\"|\"minor\",\"text\":\"…\"}]}";

/**
 * Final verification of the deliverable. Independent review routes the reviewer away from the
 * generator's model (avoidModels); selfcheck stays on the same lane but still must return JSON.
 */
export async function checkFinal(task: RavanaTask, deliverable: string, hooks: VerifierHooks): Promise<RavanaVerification> {
  const strategy = finalStrategy(task);
  hooks.emit("verification.started", { strategy });
  if (!deliverable.trim()) {
    const v: RavanaVerification = { strategy, status: "failed", findings: [{ severity: "blocker", text: "no deliverable content to verify" }], attempts: 0 };
    hooks.emit("verification.completed", { strategy, status: v.status });
    return v;
  }
  if (task.engineResolved === "preview") {
    const v: RavanaVerification = { strategy: "structural", status: "passed", findings: [], attempts: 0, detail: "preview run: deliverable well-formed; no model review performed (no provider calls in preview mode)" };
    hooks.emit("verification.completed", { strategy: "structural", status: v.status, note: v.detail });
    return v;
  }
  const generator = lastGenerator(task);
  const prompt = `TASK_KIND: ${task.kind}\nOBJECTIVE:\n${task.objective.slice(0, 2000)}\n\nDELIVERABLE UNDER REVIEW:\n${deliverable.slice(0, 14_000)}\n\n${OUT_REVIEW}`;
  try {
    const res = await hooks.llm.complete({
      role: strategy === "independent_review" ? "reasoning" : "fast",
      system: SELFCHECK_SYSTEM,
      prompt,
      maxTokens: 800,
      temperature: 0.1,
      signal: hooks.signal,
      avoid: strategy === "independent_review" && generator?.provider ? [generator.provider] : undefined,
    });
    const verdict = parseVerdict(res.content);
    const v: RavanaVerification = {
      strategy,
      status: verdict.pass && verdict.score >= 60 ? (verdict.score >= 85 ? "passed" : "passed_with_warnings") : "failed",
      score: verdict.score,
      findings: verdict.findings.slice(0, 10),
      attempts: 1,
      generator,
      reviewer: { provider: res.provider, model: res.model },
      independent: strategy === "independent_review" ? res.provider !== generator?.provider : undefined,
    };
    hooks.emit("verification.completed", { strategy, status: v.status, score: v.score, findings: v.findings, reviewer: `${res.provider}/${res.model}` });
    return v;
  } catch (e) {
    const v: RavanaVerification = { strategy, status: "failed", findings: [{ severity: "blocker", text: `reviewer call failed: ${(e as Error).message.slice(0, 300)}` }], attempts: 1, generator, reviewer: null, independent: false };
    hooks.emit("verification.completed", { strategy, status: v.status, error: v.findings[0]?.text });
    return v;
  }
}

function lastGenerator(task: RavanaTask): { provider?: string; model?: string } | null {
  // Reconstruct from events (model.selected on the final reasoning step) — best effort.
  const sel = [...task.events].reverse().find((e) => e.type === "model.selected" && e.payload?.purpose === "generate");
  if (!sel?.payload?.provider) return null;
  return { provider: String(sel.payload.provider), model: sel.payload.model ? String(sel.payload.model) : undefined };
}

/** Rough plan of verification for the manifest/UI. */
export function verificationPolicy(kind: RavanaKind, nodeTypes: RavanaNodeType[]): { final: RavanaVerifyStrategy; nodes: Record<string, RavanaVerifyStrategy> } {
  const nodes: Record<string, RavanaVerifyStrategy> = {};
  for (const t of nodeTypes) nodes[t] = t === "code" ? "tests" : "structural";
  return { final: finalStrategy({ kind, engineResolved: "mesh" } as RavanaTask), nodes };
}
