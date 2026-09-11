/**
 * Verification engine.
 *
 * Three things that were missing and are now real:
 *
 *  1. `validateSchema` — JSON-Schema validation of tool and model output, with no dependency.
 *     Supports the subset the gateway and the tool catalog actually use (type, enum, const,
 *     required, properties, additionalProperties, items, min/max, minLength/maxLength, pattern,
 *     minimum/maximum, anyOf/oneOf/allOf, nullable). Unknown keywords are ignored, never fatal.
 *  2. `reviewerGate` — an *independent* review pass: the reviewer is deliberately a different
 *     provider from the generator (so a model does not grade its own homework), is asked for a
 *     strict verdict, and the verdict is parsed defensively.
 *  3. `verifyWithTests` — a test loop. The command runs in the existing server sandbox, the failure
 *     output is fed back to a revise function, and it re-runs, up to `maxIterations`. Every attempt
 *     is recorded, and the result says honestly why it stopped.
 *
 * Nothing here calls a model directly: the model is injected (`complete`), so the whole engine is
 * exercised offline by `tests/verification.test.ts`. The test loop really executes commands — that
 * test runs `node -e` through `src/core/execution/sandbox.ts`.
 */
import { execute, policyCheck } from "../execution/sandbox";
import { record } from "../observability/events";

// --------------------------------------------------------------------------- schema validation

export type Json = unknown;

export interface ValidationIssue {
  /** JSON-pointer-ish path, `""` for the root. */
  path: string;
  message: string;
  keyword: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
  /** The schema was usable. `false` means the schema itself was malformed — say so, don't guess. */
  schemaOk: boolean;
}

const TYPES: Record<string, (v: Json) => boolean> = {
  string: (v) => typeof v === "string",
  number: (v) => typeof v === "number" && Number.isFinite(v),
  integer: (v) => typeof v === "number" && Number.isInteger(v),
  boolean: (v) => typeof v === "boolean",
  null: (v) => v === null,
  array: (v) => Array.isArray(v),
  object: (v) => typeof v === "object" && v !== null && !Array.isArray(v),
};

function isSchema(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Validate `value` against a JSON-Schema-ish `schema`. Pure; never throws. */
export function validateSchema(value: Json, schema: unknown, at = ""): ValidationResult {
  const issues: ValidationIssue[] = [];
  if (!isSchema(schema)) {
    return { valid: false, schemaOk: false, issues: [{ path: at, message: "schema must be an object", keyword: "schema" }] };
  }
  const push = (keyword: string, message: string, path = at) => issues.push({ path, message, keyword });

  // boolean schemas: `true` accepts everything, `false` rejects everything
  if (schema.type === undefined && Object.keys(schema).length === 0) return { valid: true, issues: [], schemaOk: true };

  const nullable = schema.nullable === true || (Array.isArray(schema.type) && (schema.type as string[]).includes("null"));
  if (value === null) {
    if (!nullable && schema.type !== undefined && schema.type !== "null") push("type", "expected a value, got null");
    return { valid: issues.length === 0, issues, schemaOk: true };
  }

  if (schema.type !== undefined) {
    const allowed = Array.isArray(schema.type) ? (schema.type as string[]) : [schema.type as string];
    const ok = allowed.some((t) => TYPES[t]?.(value));
    if (!ok) push("type", `expected ${allowed.join(" | ")}, got ${Array.isArray(value) ? "array" : value === null ? "null" : typeof value}`);
  }

  if (schema.const !== undefined && value !== schema.const) push("const", `must equal ${JSON.stringify(schema.const)}`);
  if (Array.isArray(schema.enum) && !schema.enum.includes(value as never)) push("enum", `must be one of ${JSON.stringify(schema.enum)}`);

  if (typeof value === "string") {
    if (typeof schema.minLength === "number" && value.length < schema.minLength) push("minLength", `shorter than ${schema.minLength}`);
    if (typeof schema.maxLength === "number" && value.length > schema.maxLength) push("maxLength", `longer than ${schema.maxLength}`);
    if (typeof schema.pattern === "string") {
      let re: RegExp | null = null;
      try {
        re = new RegExp(schema.pattern);
      } catch {
        return { valid: false, schemaOk: false, issues: [{ path: at, message: `invalid pattern ${schema.pattern}`, keyword: "pattern" }] };
      }
      if (!re.test(value)) push("pattern", `does not match ${schema.pattern}`);
    }
  }

  if (typeof value === "number") {
    if (typeof schema.minimum === "number" && value < schema.minimum) push("minimum", `less than ${schema.minimum}`);
    if (typeof schema.maximum === "number" && value > schema.maximum) push("maximum", `greater than ${schema.maximum}`);
    if (typeof schema.exclusiveMinimum === "number" && value <= schema.exclusiveMinimum) push("exclusiveMinimum", `must be > ${schema.exclusiveMinimum}`);
    if (typeof schema.exclusiveMaximum === "number" && value >= schema.exclusiveMaximum) push("exclusiveMaximum", `must be < ${schema.exclusiveMaximum}`);
  }

  if (Array.isArray(value)) {
    if (typeof schema.minItems === "number" && value.length < schema.minItems) push("minItems", `fewer than ${schema.minItems} items`);
    if (typeof schema.maxItems === "number" && value.length > schema.maxItems) push("maxItems", `more than ${schema.maxItems} items`);
    if (isSchema(schema.items)) {
      value.forEach((item, i) => issues.push(...validateSchema(item, schema.items, `${at}/${i}`).issues));
    }
  }

  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    if (Array.isArray(schema.required)) {
      for (const key of schema.required as string[]) {
        if (!(key in obj) || obj[key] === undefined) push("required", `missing required property "${key}"`, `${at}/${key}`);
      }
    }
    const props = isSchema(schema.properties) ? (schema.properties as Record<string, unknown>) : {};
    for (const [key, sub] of Object.entries(props)) {
      if (obj[key] !== undefined) issues.push(...validateSchema(obj[key], sub, `${at}/${key}`).issues);
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(obj)) {
        if (!(key in props)) push("additionalProperties", `unexpected property "${key}"`, `${at}/${key}`);
      }
    }
  }

  const combos: [string, (r: ValidationResult[]) => boolean][] = [
    ["allOf", (rs) => rs.every((r) => r.valid)],
    ["anyOf", (rs) => rs.some((r) => r.valid)],
    ["oneOf", (rs) => rs.filter((r) => r.valid).length === 1],
  ];
  for (const [keyword, test] of combos) {
    const subs = schema[keyword];
    if (!Array.isArray(subs) || !subs.length) continue;
    const results = subs.map((s) => validateSchema(value, s, at));
    if (!test(results)) {
      push(keyword, `${keyword} did not match (${results.map((r) => (r.valid ? "ok" : r.issues[0]?.message ?? "invalid")).join("; ")})`);
    }
  }

  return { valid: issues.length === 0, issues, schemaOk: true };
}

/** Pull the first JSON object/array out of a model's answer (models wrap JSON in prose and fences). */
export function extractJson(text: string): { value: Json; found: boolean; error?: string } {
  const trimmed = text.trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  const candidates = [fenced?.[1], trimmed];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const start = Math.min(...[candidate.indexOf("{"), candidate.indexOf("[")].filter((i) => i >= 0));
    if (!Number.isFinite(start)) continue;
    const slice = candidate.slice(start);
    try {
      return { value: JSON.parse(slice), found: true };
    } catch {
      /* try the next candidate, then the balanced scan below */
    }
    // balanced scan: models often append prose after the JSON
    let depth = 0;
    let inString = false;
    let escaped = false;
    const open = slice[0];
    const close = open === "{" ? "}" : "]";
    for (let i = 0; i < slice.length; i++) {
      const ch = slice[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === "\\") escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') inString = true;
      else if (ch === open) depth++;
      else if (ch === close) {
        depth--;
        if (depth === 0) {
          try {
            return { value: JSON.parse(slice.slice(0, i + 1)), found: true };
          } catch {
            break;
          }
        }
      }
    }
  }
  return { value: null, found: false, error: "no JSON object found in the output" };
}

// --------------------------------------------------------------------------- independent reviewer

export type Complete = (req: {
  messages: { role: "system" | "user" | "assistant"; content: string }[];
  preferred?: string[];
  avoid?: string[];
  maxTokens?: number;
  temperature?: number;
}) => Promise<{ content: string; provider?: string; model?: string }>;

export interface ReviewVerdict {
  pass: boolean;
  score: number;
  findings: { severity: "blocker" | "major" | "minor"; text: string }[];
  /** Which model actually reviewed — recorded so "independent" is checkable, not asserted. */
  reviewer: string | null;
  generator: string | null;
  independent: boolean;
  raw: string;
}

const REVIEW_SYSTEM = `You are an independent reviewer. You did not write the answer under review and you are not trying to be agreeable.
Check it against the question for: factual errors, unsupported claims presented as fact, missing edge cases the question implies, internal contradictions, and instructions in the question that were ignored.
Answer with JSON only, no prose:
{"pass": true|false, "score": 0-100, "findings": [{"severity": "blocker"|"major"|"minor", "text": "..."}]}
"pass" must be false if there is any blocker.`;

/** Parse a reviewer's answer defensively — models deviate, and a crash here would fail closed. */
export function parseVerdict(raw: string): { pass: boolean; score: number; findings: { severity: "blocker" | "major" | "minor"; text: string }[] } {
  const { value, found } = extractJson(raw);
  if (!found || typeof value !== "object" || value === null) {
    // No JSON: treat as a failed review rather than a silent pass.
    return { pass: false, score: 0, findings: [{ severity: "blocker", text: `reviewer did not return JSON: ${raw.slice(0, 160)}` }] };
  }
  const v = value as { pass?: unknown; score?: unknown; findings?: unknown };
  const findings = Array.isArray(v.findings)
    ? v.findings
        .filter((f): f is { severity?: unknown; text?: unknown } => typeof f === "object" && f !== null)
        .map((f) => ({
          severity: (["blocker", "major", "minor"].includes(String(f.severity)) ? String(f.severity) : "minor") as "blocker" | "major" | "minor",
          text: String(f.text ?? "").slice(0, 500),
        }))
        .filter((f) => f.text)
    : [];
  const score = typeof v.score === "number" && Number.isFinite(v.score) ? Math.max(0, Math.min(100, Math.round(v.score))) : findings.length ? 0 : 100;
  const hasBlocker = findings.some((f) => f.severity === "blocker");
  const pass = v.pass === true && !hasBlocker;
  return { pass, score, findings };
}

/**
 * Independent review gate. `avoid` keeps the reviewer off the generator's provider; the returned
 * `independent` flag reports whether that actually held, instead of assuming it.
 */
export async function reviewerGate(opts: {
  question: string;
  answer: string;
  generator?: string | null;
  complete: Complete;
  minScore?: number;
  meta?: { uid?: string; capability?: string };
}): Promise<ReviewVerdict> {
  const t0 = Date.now();
  let out: { content: string; provider?: string; model?: string };
  try {
    out = await opts.complete({
      messages: [
        { role: "system", content: REVIEW_SYSTEM },
        { role: "user", content: `QUESTION:\n${opts.question.slice(0, 6000)}\n\nANSWER UNDER REVIEW:\n${opts.answer.slice(0, 12000)}` },
      ],
      avoid: opts.generator ? [opts.generator] : undefined,
      temperature: 0,
      maxTokens: 900,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    record({ type: "agent", uid: opts.meta?.uid, capability: opts.meta?.capability ?? "system:verifier", ok: false, ms: Date.now() - t0, detail: `reviewer failed: ${msg}` });
    return { pass: false, score: 0, findings: [{ severity: "blocker", text: `reviewer could not run: ${msg}` }], reviewer: null, generator: opts.generator ?? null, independent: false, raw: "" };
  }
  let reviewer = out.provider ?? out.model ?? null;
  const sameAsGenerator = () => opts.generator != null && reviewer === opts.generator;
  if (sameAsGenerator()) {
    // The provider could not be avoided (only one is configured). Ask once more for a different
    // one; if it still lands on the generator, report `independent:false` rather than claiming it.
    try {
      const again = await opts.complete({
        messages: [
          { role: "system", content: REVIEW_SYSTEM },
          { role: "user", content: `QUESTION:\n${opts.question.slice(0, 6000)}\n\nANSWER UNDER REVIEW:\n${opts.answer.slice(0, 12000)}` },
        ],
        avoid: [opts.generator!],
        temperature: 0,
        maxTokens: 900,
      });
      const againReviewer = again.provider ?? again.model ?? null;
      if (againReviewer !== opts.generator) {
        out = again;
        reviewer = againReviewer;
      }
    } catch {
      /* keep the first review; a same-provider review beats none, and it is flagged below */
    }
  }
  const verdict = parseVerdict(out.content);
  const minScore = opts.minScore ?? 70;
  const independent = reviewer !== null && (opts.generator == null || reviewer !== opts.generator);
  const pass = verdict.pass && verdict.score >= minScore;
  record({
    type: "agent",
    uid: opts.meta?.uid,
    capability: opts.meta?.capability ?? "system:verifier",
    ok: pass,
    ms: Date.now() - t0,
    detail: `reviewer ${reviewer ?? "unknown"} → ${pass ? "PASS" : "FAIL"} ${verdict.score}/100 (${verdict.findings.length} findings)`,
    meta: { score: verdict.score, independent, generator: opts.generator ?? null },
  });
  return { ...verdict, pass, reviewer, generator: opts.generator ?? null, independent, raw: out.content.slice(0, 4000) };
}

// --------------------------------------------------------------------------- test loop

export interface TestAttempt {
  iteration: number;
  ok: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  ms: number;
  error?: string;
  revision?: string;
}

export interface TestLoopResult {
  ok: boolean;
  attempts: TestAttempt[];
  iterations: number;
  /** Why the loop ended — reported so a caller never has to guess. `revise_gave_up` means the
   *  revision function was offered the failure and returned nothing. */
  stoppedBecause: "passed" | "max_iterations" | "revise_gave_up" | "runner_failed" | "command_refused";
  finalOutput: string;
  files: Record<string, string>;
}

/**
 * Run a test/type-check command in the server sandbox; on failure, ask `revise` for a fix and run
 * again, up to `maxIterations`. The sandbox policy is applied before the first run, so a refused
 * command is reported as refused rather than looping.
 */
export async function verifyWithTests(opts: {
  command: string;
  files?: Record<string, string>;
  /** Given the failing output, return the corrected files (or null to give up). */
  revise?: (ctx: { iteration: number; stdout: string; stderr: string; files: Record<string, string> }) => Promise<Record<string, string> | null>;
  maxIterations?: number;
  timeoutMs?: number;
  network?: boolean;
  meta?: { uid?: string; capability?: string };
}): Promise<TestLoopResult> {
  const maxIterations = Math.max(1, Math.min(opts.maxIterations ?? 3, 6));
  const attempts: TestAttempt[] = [];
  let files = { ...(opts.files ?? {}) };
  const refused = policyCheck(opts.command);
  if (refused) {
    record({ type: "execution", uid: opts.meta?.uid, capability: opts.meta?.capability ?? "system:verifier", ok: false, detail: `test loop refused: ${refused}` });
    return { ok: false, attempts, iterations: 0, stoppedBecause: "command_refused", finalOutput: refused, files };
  }
  let stoppedBecause: TestLoopResult["stoppedBecause"] = "max_iterations";
  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    let res;
    try {
      res = await execute({ command: opts.command, files, timeoutMs: opts.timeoutMs ?? 30_000, network: opts.network ?? false }, { uid: opts.meta?.uid, capability: opts.meta?.capability ?? "system:verifier" });
    } catch (e) {
      attempts.push({ iteration, ok: false, exitCode: null, stdout: "", stderr: "", ms: 0, error: e instanceof Error ? e.message : String(e) });
      stoppedBecause = "runner_failed";
      break;
    }
    const attempt: TestAttempt = { iteration, ok: res.ok, exitCode: res.exitCode, stdout: res.stdout.slice(-8000), stderr: res.stderr.slice(-8000), ms: res.ms, error: res.error };
    attempts.push(attempt);
    if (res.ok) {
      stoppedBecause = "passed";
      break;
    }
    if (iteration === maxIterations || !opts.revise) break;
    let revised: Record<string, string> | null = null;
    try {
      revised = await opts.revise({ iteration, stdout: res.stdout, stderr: res.stderr, files });
    } catch {
      revised = null;
    }
    if (!revised) { stoppedBecause = "revise_gave_up"; break; }
    files = { ...files, ...revised };
    attempt.revision = Object.keys(revised).join(", ");
  }
  const last = attempts.at(-1);
  const result: TestLoopResult = {
    ok: stoppedBecause === "passed",
    attempts,
    iterations: attempts.length,
    stoppedBecause,
    finalOutput: last ? `${last.stdout}\n${last.stderr}`.trim() : "",
    files,
  };
  record({
    type: "agent",
    uid: opts.meta?.uid,
    capability: opts.meta?.capability ?? "system:verifier",
    ok: result.ok,
    detail: `test loop ${opts.command.slice(0, 80)} → ${stoppedBecause} after ${attempts.length} attempt(s)`,
    meta: { iterations: attempts.length, stoppedBecause },
  });
  return result;
}

/** What this engine can and cannot do on this host — reported, not assumed. */
export async function verifierStatus() {
  const sandbox = await import("../execution/sandbox").then((m) => m.sandboxStatus());
  return {
    schemaValidation: true,
    independentReviewer: true,
    testLoop: true,
    testLoopRunner: sandbox.available ? "server sandbox" : "unavailable",
    networkIsolation: sandbox.networkIsolation,
    container: sandbox.container,
  };
}
