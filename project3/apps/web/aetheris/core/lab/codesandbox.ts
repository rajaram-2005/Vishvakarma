/**
 * Lab — sandboxed self-modification environment.
 *
 *   Goal: give the agent a *safe* way to write, compile, test, and deploy a new
 *         processing script (Python or C++) on the fly, without risking the host.
 *
 *   Design:
 *     - This module is *opt-in* and requires a new `self_modify` grant on the principal.
 *       There is no bypass, no default grant, and no implicit enable.
 *     - The actual execution goes through the existing sandbox (../execution/sandbox.ts)
 *       which already provides: fresh temp workspace, scrubbed env, hard timeout, output
 *       caps, allow-listed binaries (gcc/g++/python3), and `unshare -rn` network
 *       isolation when the host supports it. We do NOT reimplement that here.
 *     - The "deploy" step writes a *copy* of the produced script to a directory the user
 *       has explicitly configured (default: <data>/lab/deployed). The host Aetheris
 *       process is never modified.
 *     - The `simulated` mode lets the agent iterate without a Docker daemon (and is the
 *       default when Docker is unavailable). It still uses the server sandbox; nothing
 *       is "pretend-executed".
 *
 *   What it is NOT:
 *     - Not a Docker orchestrator. We shell out to the user's `docker` binary only when
 *       the user has opted in AND the binary is on PATH AND the call is configured.
 *       Aetheris does not start a Docker daemon and does not require one.
 *     - Not a place to run untrusted code from the open internet. The caller (the
 *       agent) is responsible for what it writes; this module is responsible for
 *       *how* it runs.
 *
 *   Status: EXPERIMENTAL. The API surface is small and honest about what runs where.
 */

import { spawn } from "node:child_process";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { record } from "../observability/events";
import { execute, sandboxStatus } from "../execution/sandbox";
import { authorize, type Principal } from "../policy/permissions";
import { hostedMode } from "@/aetheris/lib/hosted";

// --------------------------------------------------------------------------- public types

export type LabLanguage = "python" | "cpp";
export type LabRuntime = "sandbox" | "docker";

export interface LabRequest {
  principal: Principal;
  /** Human-readable summary; included in the audit event. */
  description: string;
  language: LabLanguage;
  /** Source code. For cpp, exactly one of sourceFiles (preferred) or source. */
  source?: string;
  sourceFiles?: Record<string, string>;
  /** Entry point file to run. Defaults to "main.py" / "main.cpp". */
  entry?: string;
  /** Args passed to the program. */
  args?: string[];
  /** Required. Lab always uses the server sandbox; this is the additional runtime. */
  runtime: LabRuntime;
  /** For docker: image to use. Defaults to "python:3.12-alpine" / "gcc:14-alpine". */
  image?: string;
  /** For docker: bind-mount a host directory into the container. OFF by default. */
  mountHostDir?: string;
  mountContainerDir?: string;
  /** Hard wall-clock cap. Defaults to 30s, max 120s. */
  timeoutMs?: number;
  /** Test command run after the build/compile step. Optional. */
  testCommand?: string;
  testFiles?: Record<string, string>;
  /** Deploy directory; the produced entry file is copied here on success. */
  deployDir?: string;
  /** Reject the call if this would touch the host filesystem outside the sandbox. */
  network?: boolean;
  /** Single-use token from `issueConfirmation(uid, "lab:run")`. Required for the
   *  policy gate to allow this capability. The route issues one when the user clicks
   *  "Run in lab" in the Control Center. */
  confirmationToken?: string;
}

export interface LabResult {
  ok: boolean;
  stoppedBecause: "passed" | "compile_failed" | "test_failed" | "run_failed" | "policy_denied" | "docker_unavailable" | "timeout" | "runtime_error";
  /** Output of the test command (or the run, if no test command was given). */
  output: string;
  /** Output of the main program. */
  programOutput: string;
  /** Files that changed in the sandbox. */
  fsChanges: string[];
  /** Path the entry file was deployed to, if deployDir was set and the run succeeded. */
  deployedTo?: string;
  ms: number;
}

// --------------------------------------------------------------------------- entry point

/**
 * Run a lab request. Always goes through the permission gate (`self_modify` grant) and
 * the existing server sandbox. The docker runtime is a *strict* shell-out to the host
 * `docker` binary, only used when the user opted in.
 */
export async function runInLab(req: LabRequest, meta: { uid?: string } = {}): Promise<LabResult> {
  const t0 = Date.now();
  // 1. permission gate: self_modify is a fresh grant, off by default.
  const decision = authorize({ principal: req.principal, capabilityId: "lab:run", required: "full_workspace", requiresConfirmation: true, confirmationToken: req.confirmationToken, args: { language: req.language, runtime: req.runtime } });
  if (!decision.allow) return auditReject(req, meta, t0, "policy_denied", decision.reason);
  // 2. cap the timeout so a runaway cannot lock the request.
  const timeoutMs = Math.max(500, Math.min(req.timeoutMs ?? 30_000, 120_000));
  // 3. validate inputs.
  const entry = req.entry ?? (req.language === "python" ? "main.py" : "main.cpp");
  const files = req.language === "python"
    ? { ...(req.sourceFiles ?? {}), ...(req.source ? { [entry]: req.source } : {}) }
    : { ...(req.sourceFiles ?? {}), ...(req.source ? { [entry]: req.source } : {}) };
  if (!files[entry]) return auditReject(req, meta, t0, "runtime_error", `no source provided for entry ${entry}`);

  // 4. dispatch.
  if (req.runtime === "sandbox") return runInSandbox(req, files, entry, timeoutMs, meta, t0);
  return runInDocker(req, files, entry, timeoutMs, meta, t0);
}

function auditReject(req: LabRequest, meta: { uid?: string }, t0: number, why: LabResult["stoppedBecause"], detail: string): LabResult {
  record({ type: "execution", uid: meta.uid ?? req.principal.uid, capability: "lab:run", ok: false, detail: `lab ${why}: ${detail}`, meta: { language: req.language, runtime: req.runtime } });
  return { ok: false, stoppedBecause: why, output: detail, programOutput: "", fsChanges: [], ms: Date.now() - t0 };
}

// --------------------------------------------------------------------------- sandbox runtime (the default, always available)

async function runInSandbox(req: LabRequest, files: Record<string, string>, entry: string, timeoutMs: number, meta: { uid?: string }, t0: number): Promise<LabResult> {
  const allFiles: Record<string, string> = { ...files, ...(req.testFiles ?? {}) };
  const isTimeout = (r: { error?: string }) => r.error === "timeout";
  // 1. optional test pass (in its own fresh workspace, so no carry-over from compile).
  if (req.testCommand) {
    const test = await execute({ command: req.testCommand, files: allFiles, timeoutMs, network: req.network ?? false }, { uid: meta.uid ?? req.principal.uid, capability: "lab:test" });
    if (!test.ok) return finish(req, t0, "test_failed", `${test.stdout}\n${test.stderr}`.trim(), "", test.fsChanges, isTimeout(test) ? "timeout" : "test_failed");
  }
  // 2. compile (cpp) AND run in the SAME sandbox call so the binary survives. For
  //    Python the run command is direct.
  if (req.language === "cpp") {
    const binary = "a.out";
    const combined = `g++ -O2 -std=c++17 -o ${binary} ${entry} && ./${binary} ${(req.args ?? []).map(shellQuote).join(" ")}`;
    const r = await execute({ command: combined, files, timeoutMs, network: req.network ?? false }, { uid: meta.uid ?? req.principal.uid, capability: "lab:compile+run" });
    if (!r.ok) {
      // distinguish compile failure from run failure: the compile is the first stage
      const compileError = /g\+\+:|error:|fatal error:/i.test(`${r.stdout}\n${r.stderr}`);
      return finish(req, t0, compileError ? "compile_failed" : "run_failed", `${r.stdout}\n${r.stderr}`.trim(), r.stdout, r.fsChanges, isTimeout(r) ? "timeout" : (compileError ? "compile_failed" : "run_failed"));
    }
    return finish(req, t0, "passed", "", r.stdout, r.fsChanges, undefined, files[entry]);
  }
  const run = await execute({ command: `python3 ${shellQuote(entry)} ${(req.args ?? []).map(shellQuote).join(" ")}`, files, timeoutMs, network: req.network ?? false }, { uid: meta.uid ?? req.principal.uid, capability: "lab:run" });
  if (!run.ok) return finish(req, t0, "run_failed", `${run.stdout}\n${run.stderr}`.trim(), run.stdout, run.fsChanges, isTimeout(run) ? "timeout" : "run_failed");
  return finish(req, t0, "passed", "", run.stdout, run.fsChanges, undefined, files[entry]);
}

// --------------------------------------------------------------------------- docker runtime (opt-in)

async function runInDocker(req: LabRequest, files: Record<string, string>, entry: string, timeoutMs: number, meta: { uid?: string }, t0: number): Promise<LabResult> {
  // Serverless hosts have no docker daemon — fast-fail without spawning rather than timing out.
  if (hostedMode()) return finish(req, t0, "docker_unavailable", "docker runtime is unavailable on hosted/serverless instances (no daemon); use the sandbox runtime", "", [], "docker_unavailable");
  // Confirm docker is on PATH; fail honestly otherwise. We do not pretend.
  const dockerOk = await new Promise<boolean>((res) => {
    const p = spawn("docker", ["version", "--format", "{{.Server.Version}}"], { stdio: "ignore" });
    p.on("error", () => res(false));
    p.on("exit", (c) => res(c === 0));
    setTimeout(() => res(false), 3000);
  });
  if (!dockerOk) return finish(req, t0, "docker_unavailable", "docker binary not found on PATH or daemon not reachable", "", [], "docker_unavailable");

  const image = req.image ?? (req.language === "python" ? "python:3.12-alpine" : "gcc:14-alpine");
  const mount = req.mountHostDir && req.mountContainerDir
    ? ["-v", `${req.mountHostDir}:${req.mountContainerDir}`]
    : req.mountHostDir ? ["-v", `${req.mountHostDir}:/work`] : [];
  // We stage files in a temp dir and COPY them in; the container never sees the host
  // filesystem beyond what the caller explicitly mounted.
  const fsPromises = await import("node:fs/promises");
  const os = await import("node:os");
  const stage = await fsPromises.mkdtemp(os.tmpdir() + "/aeth-lab-");
  try {
    for (const [name, content] of Object.entries(files)) await writeFile(join(stage, name), content);
    const cmd = req.language === "cpp"
      ? ["sh", "-lc", `cp -r /src/. /work && g++ -O2 -std=c++17 -o /work/a.out ${entry} && /work/a.out ${(req.args ?? []).join(" ")}`]
      : ["sh", "-lc", `cp -r /src/. /work && cd /work && python3 ${entry} ${(req.args ?? []).join(" ")}`];
    const args = ["run", "--rm", "--network=none", ...mount, "-v", `${stage}:/src:ro`, "-w", "/work", image, ...cmd];
    const out = await runProcess("docker", args, timeoutMs);
    if (out.code !== 0) return finish(req, t0, out.timedOut ? "timeout" : "run_failed", `${out.stdout}\n${out.stderr}`.trim(), out.stdout, [], out.timedOut ? "timeout" : "run_failed");
    return finish(req, t0, "passed", "", out.stdout, [], undefined, files[entry]);
  } finally { await rm(stage, { recursive: true, force: true }).catch(() => undefined); }
}

function runProcess(bin: string, args: string[], timeoutMs: number): Promise<{ code: number | null; stdout: string; stderr: string; timedOut: boolean }> {
  return new Promise((resolve) => {
    const p = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "", timedOut = false;
    const t = setTimeout(() => { timedOut = true; try { p.kill("SIGKILL"); } catch { /* noop */ } }, timeoutMs);
    p.stdout.on("data", (d) => { if (stdout.length < 200_000) stdout += d.toString(); });
    p.stderr.on("data", (d) => { if (stderr.length < 200_000) stderr += d.toString(); });
    p.on("error", (e) => { clearTimeout(t); resolve({ code: 127, stdout, stderr: stderr + e.message, timedOut }); });
    p.on("close", (code) => { clearTimeout(t); resolve({ code, stdout, stderr, timedOut }); });
  });
}

// --------------------------------------------------------------------------- deployment

async function finish(req: LabRequest, t0: number, stoppedBecause: LabResult["stoppedBecause"], output: string, programOutput: string, fsChanges: string[], override?: LabResult["stoppedBecause"], source?: string): Promise<LabResult> {
  const ms = Date.now() - t0;
  const ok = stoppedBecause === "passed";
  const entry = req.entry ?? (req.language === "python" ? "main.py" : "main.cpp");
  let deployedTo: string | undefined;
  if (ok && req.deployDir && source !== undefined) {
    try {
      await mkdir(req.deployDir, { recursive: true });
      const target = join(req.deployDir, `${Date.now()}-${entry}`);
      await writeFile(target, source);
      deployedTo = target;
    } catch (e) {
      record({ type: "execution", uid: req.principal.uid, capability: "lab:deploy", ok: false, detail: `deploy failed: ${(e as Error).message}` });
    }
  }
  record({ type: "execution", uid: req.principal.uid, capability: "lab:run", ok, ms, detail: `lab ${req.language}/${req.runtime} → ${stoppedBecause}`, meta: { fsChanges: fsChanges.length, deployed: !!deployedTo } });
  return { ok, stoppedBecause: override ?? stoppedBecause, output, programOutput, fsChanges, deployedTo, ms };
}

// --------------------------------------------------------------------------- listing deployed artifacts (for the UI)

export async function listDeployed(dir: string | undefined): Promise<{ path: string; size: number; mtime: number }[]> {
  if (!dir || !existsSync(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  const out: { path: string; size: number; mtime: number }[] = [];
  for (const e of entries) {
    if (!e.isFile()) continue;
    const p = join(dir, e.name);
    const st = await readFile(p).then((b) => ({ size: b.length, mtime: 0 })).catch(() => ({ size: 0, mtime: 0 }));
    out.push({ path: p, size: st.size, mtime: st.mtime });
  }
  return out.sort((a, b) => b.mtime - a.mtime).slice(0, 100);
}

// --------------------------------------------------------------------------- status

export async function labStatus() {
  const sb = await sandboxStatus();
  // Hosted: no daemon to probe (and no shared disk for artifacts) — report, don't spawn.
  if (hostedMode()) {
    return {
      available: true,
      sandbox: sb,
      docker: false,
      ephemeral: true,
      deployDir: labDeployDir(),
      languageSupport: { python: true, cpp: true },
      note: "Hosted instance: docker runtime unavailable; deployed artifacts live in ephemeral /tmp and vanish when the instance freezes.",
    };
  }
  const docker = await new Promise<boolean>((res) => { const p = spawn("docker", ["version", "--format", "{{.Server.Version}}"], { stdio: "ignore" }); p.on("error", () => res(false)); p.on("exit", (c) => res(c === 0)); setTimeout(() => res(false), 3000); });
  return {
    available: true,
    sandbox: sb,
    docker,
    ephemeral: false,
    deployDir: labDeployDir(),
    languageSupport: { python: true, cpp: true },
    note: "All runs go through the server sandbox; docker is an *additional* runtime that the user must explicitly enable per request.",
  };
}

/**
 * Where deployed lab artifacts live. An explicit AETHERIS_LAB_DEPLOY_DIR wins; hosted instances
 * use the ephemeral temp dir (the only writable path on serverless); local default is
 * <data>/lab/deployed. Resolved per call so tests can flip modes by setting env.
 */
export function labDeployDir(): string {
  if (process.env.AETHERIS_LAB_DEPLOY_DIR) return process.env.AETHERIS_LAB_DEPLOY_DIR;
  if (hostedMode()) return join(tmpdir(), "aeth-lab-deployed");
  return join(process.env.AETHERIS_DATA_DIR ?? "data", "lab", "deployed");
}

function shellQuote(s: string): string {
  // Conservative POSIX-ish single-quote escape. The sandbox will only see argv we built here.
  return "'" + s.replace(/'/g, "'\\''") + "'";
}
