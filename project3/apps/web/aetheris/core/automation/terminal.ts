/**
 * Sandboxed Terminal.
 *
 *   A thin wrapper around the production sandbox executor
 *   (@/core/execution/sandbox) that:
 *     - enforces a per-command policy check (the production
 *       allowlist + path-traversal block)
 *     - runs each command in a fresh temp workspace with
 *       env-scrubbing, SIGKILL timeout, and an output cap
 *     - records an observability event of type 'execution'
 *     - returns a structured result with output, exit code,
 *       timing, and the list of fs changes
 *
 *   Reads of files (cat, ls, head) and small actions
 *   (mkdir, touch, echo) are accepted as-is. Network and
 *   privilege-escalation primitives (curl/wget piped to
 *   interpreters, sudo, etc.) are blocked by policyCheck.
 */

import { execute, policyCheck, type ExecRequest, type ExecResult } from "@/aetheris/core/execution/sandbox";
import { record } from "@/aetheris/core/observability/events";

export interface TerminalRequest {
  uid: string;
  command: string;
  timeoutMs?: number;
  network?: boolean;
  maxOutput?: number;
}

export interface TerminalResult {
  ok: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  ms: number;
  policyReason: string | null;
  policyOk: boolean;
  binary: string | null;
  command: string;
  ranAt: number;
  fsChanges: string[];
  capability: string;
}

function firstBinary(cmd: string): string | null {
  const trimmed = cmd.trim();
  if (!trimmed) return null;
  const first = trimmed.split(/\s+/)[0] ?? "";
  const bin = first.split("/").pop() ?? "";
  return bin;
}

export async function runTerminal(req: TerminalRequest): Promise<TerminalResult> {
  const cap = "tool:terminal.run";
  const ranAt = Date.now();
  const binary = firstBinary(req.command);
  if (!binary) {
    record({ type: "execution", uid: req.uid, capability: cap, ok: false, ms: 0, detail: "empty command" });
    return { ok: false, exitCode: null, stdout: "", stderr: "empty command", ms: 0, policyReason: "empty command", policyOk: false, binary: null, command: req.command, ranAt, fsChanges: [], capability: cap };
  }
  const reason = policyCheck(req.command);
  if (reason) {
    record({ type: "execution", uid: req.uid, capability: cap, ok: false, ms: 0, detail: reason });
    return { ok: false, exitCode: null, stdout: "", stderr: reason, ms: 0, policyReason: reason, policyOk: false, binary, command: req.command, ranAt, fsChanges: [], capability: cap };
  }
  const execReq: ExecRequest = { command: req.command, timeoutMs: req.timeoutMs ?? 5000, network: req.network ?? false, maxOutput: req.maxOutput ?? 64_000 };
  const t0 = Date.now();
  let r: ExecResult;
  try {
    r = await execute(execReq, { uid: req.uid, capability: cap });
  } catch (err) {
    const msg = (err as Error)?.message ?? String(err);
    record({ type: "execution", uid: req.uid, capability: cap, ok: false, ms: Date.now() - t0, detail: msg });
    return { ok: false, exitCode: null, stdout: "", stderr: msg, ms: Date.now() - t0, policyReason: null, policyOk: true, binary, command: req.command, ranAt, fsChanges: [], capability: cap };
  }
  record({ type: "execution", uid: req.uid, capability: cap, ok: r.ok, ms: r.ms, detail: r.ok ? `${binary} ok` : `exit ${r.exitCode} (${binary})` });
  return {
    ok: r.ok,
    exitCode: r.exitCode,
    stdout: r.stdout,
    stderr: r.stderr,
    ms: r.ms,
    policyReason: null,
    policyOk: true,
    binary,
    command: req.command,
    ranAt,
    fsChanges: r.fsChanges,
    capability: cap,
  };
}
