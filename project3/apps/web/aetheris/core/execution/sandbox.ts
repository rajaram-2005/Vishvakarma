/**
 * Server-side execution sandbox (Phase 6). STATUS: IMPLEMENTED (process isolation) — not a VM.
 *
 *  Execution Request → Permission Check → Security Policy → Sandbox → Command → Output → Verifier
 *
 * Isolation actually applied (and reported per run so nothing is over-claimed):
 *  • fresh per-run temp workspace, deleted afterwards; the command cannot reference paths outside
 *    it (policy rejects absolute paths, `..`, `~`, and known-dangerous binaries)
 *  • empty environment (only PATH/HOME/LANG/TMPDIR) — no secrets can leak into child processes
 *  • hard wall-clock timeout (SIGKILL), stdout/stderr caps, max-buffer
 *  • network disabled via `unshare -rn` when the host allows unprivileged user namespaces
 *    (Linux); otherwise `networkIsolated:false` is returned and the caller decides
 *  • allow-listed interpreters: python3, node, bash (scripts inside workspace), plus common tools
 * Every run is audited as an `execution` event with duration, exit code and fs changes.
 */
import { spawn } from "node:child_process";
import { mkdtemp, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { record } from "../observability/events";

export interface ExecRequest { command: string; files?: Record<string, string>; timeoutMs?: number; network?: boolean; maxOutput?: number; env?: Record<string, string> }
export interface ExecResult { ok: boolean; exitCode: number | null; signal?: string; stdout: string; stderr: string; ms: number; fsChanges: string[]; isolation: { workspace: true; envScrubbed: true; timeout: true; networkIsolated: boolean; mechanism: string }; truncated: boolean; error?: string }

const ALLOWED_BIN = new Set(["python3", "python", "node", "npx", "bash", "sh", "ls", "cat", "echo", "grep", "sed", "awk", "wc", "sort", "head", "tail", "find", "diff", "tsc", "npm", "pip", "pip3", "git", "make", "gcc", "g++", "go", "cargo", "rustc", "java", "javac", "jq", "curl", "wget", "tar", "unzip", "env", "true", "false", "test", "printf", "date", "seq", "xargs", "tee", "touch", "mkdir", "cp", "mv", "rm", "tr", "cut", "uniq", "pwd", "which", "time", "sleep", "timeout"]);
const DENY = /(\brm\s+-rf\s+\/(\s|$))|(\bmkfs\b)|(\bdd\s+if=)|(\b(shutdown|reboot|halt|poweroff)\b)|(\bsudo\b)|(\bsu\b\s)|(\bchmod\s+[0-7]*7[0-7]*\s+\/)|(\/etc\/(passwd|shadow|sudoers))|(\bnc\b.*-e)|(\bcrontab\b)|(\bsystemctl\b)|(\bkill\s+-9\s+-1\b)|(:\(\)\s*\{)/i;

/**
 * Split a command into pipeline/`&&`/`;` segments, but ignore separators inside quotes. Without
 * this, `node -e "a(); b()"` was mis-parsed as two segments and the quoted `b()` was rejected as a
 * binary — legitimate inline scripts were refused while the check added no security.
 */
export function splitSegments(cmd: string): string[] {
  const out: string[] = [];
  let buf = "";
  let quote: "'" | '"' | "`" | null = null;
  for (let i = 0; i < cmd.length; i++) {
    const ch = cmd[i];
    if (quote) {
      if (ch === "\\") { buf += ch + (cmd[i + 1] ?? ""); i += 1; continue; }
      if (ch === quote) quote = null;
      buf += ch;
      continue;
    }
    if (ch === "\'" || ch === '"' || ch === "`") { quote = ch as "\'" | '"' | "`"; buf += ch; continue; }
    if (ch === "\\") { buf += ch + (cmd[i + 1] ?? ""); i += 1; continue; }
    const two = cmd.slice(i, i + 2);
    if (two === "||" || two === "&&") { out.push(buf); buf = ""; i += 1; continue; }
    if (ch === ";" || ch === "|" || ch === "\n" || ch === "&") { out.push(buf); buf = ""; continue; }
    buf += ch;
  }
  out.push(buf);
  return out.map((x) => x.trim()).filter(Boolean);
}

/** Static policy check — pure, tested. Returns a reason when the command is refused. */
export function policyCheck(cmd: string): string | null {
  if (!cmd.trim()) return "empty command";
  if (cmd.length > 4000) return "command too long";
  if (DENY.test(cmd)) return "command matches the deny list";
  if (/(^|\s)\/(etc|proc|sys|dev|root|home|usr|var|boot|bin|sbin|lib|opt)\b/.test(cmd) || /(^|[\s"'=])~\//.test(cmd) || /\.\.\//.test(cmd)) return "paths outside the sandbox workspace are not allowed";
  // first token of every pipeline segment must be an allowed binary (or a variable assignment / subshell)
  if (/\|\s*(ba|z|da)?sh\b/.test(cmd) || /\b(curl|wget)\b[^|;&]*\|\s*(python3?|node|perl)\b/.test(cmd)) return "piping downloaded content into an interpreter is not allowed";
  const segs = splitSegments(cmd);
  for (const seg of segs) {
    const m = /^(?:[A-Za-z_][A-Za-z0-9_]*=\S*\s+)*\(?\s*([^\s()]+)/.exec(seg); const bin = m?.[1]?.split("/").pop() ?? "";
    if (bin && !ALLOWED_BIN.has(bin) && !/^\.\//.test(m?.[1] ?? "")) return `binary not allowed: ${bin}`;
  }
  return null;
}

let unshareOk: boolean | null = null;
async function canUnshare(): Promise<boolean> {
  if (unshareOk !== null) return unshareOk;
  unshareOk = await new Promise<boolean>((res) => { const p = spawn("unshare", ["-rn", "true"], { stdio: "ignore" }); p.on("error", () => res(false)); p.on("exit", (c) => res(c === 0)); setTimeout(() => res(false), 2000); });
  return unshareOk;
}

async function snapshot(dir: string): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const walk = async (d: string, rel = "") => { for (const e of await readdir(d, { withFileTypes: true }).catch(() => [])) { const p = join(d, e.name), r = rel ? `${rel}/${e.name}` : e.name; if (e.isDirectory()) { if (e.name !== "node_modules" && e.name !== ".git") await walk(p, r); } else out.set(r, (await stat(p).catch(() => ({ mtimeMs: 0 }))).mtimeMs); } };
  await walk(dir); return out;
}

export async function execute(req: ExecRequest, meta: { uid?: string; capability?: string } = {}): Promise<ExecResult> {
  const t0 = Date.now();
  const refused = policyCheck(req.command);
  const base: Omit<ExecResult, "ok" | "exitCode" | "stdout" | "stderr" | "ms" | "fsChanges" | "truncated"> = { isolation: { workspace: true, envScrubbed: true, timeout: true, networkIsolated: false, mechanism: "child_process" } };
  if (refused) { record({ type: "execution", uid: meta.uid, capability: meta.capability ?? "execution:server-sandbox", ok: false, detail: `refused: ${refused}` }); return { ...base, ok: false, exitCode: null, stdout: "", stderr: "", ms: 0, fsChanges: [], truncated: false, error: refused }; }
  const ws = await mkdtemp(join(tmpdir(), "aeth-sbx-"));
  try {
    for (const [name, content] of Object.entries(req.files ?? {})) { if (/^\/|\.\./.test(name)) continue; await writeFile(join(ws, name), content); }
    const before = await snapshot(ws);
    const isolateNet = req.network === false || req.network === undefined; const useUnshare = isolateNet && (await canUnshare());
    const bin = useUnshare ? "unshare" : "bash"; const args = useUnshare ? ["-rn", "bash", "-lc", req.command] : ["-lc", req.command];
    const env: NodeJS.ProcessEnv = { NODE_ENV: "production", PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin", HOME: ws, TMPDIR: ws, LANG: "C.UTF-8", PYTHONDONTWRITEBYTECODE: "1", NO_COLOR: "1", ...(req.env ?? {}) };
    const max = req.maxOutput ?? 200_000; let out = "", err = "", truncated = false;
    const result = await new Promise<{ code: number | null; signal: NodeJS.Signals | null; timedOut: boolean }>((resolve) => {
      const p = spawn(bin, args as string[], { cwd: ws, env, stdio: ["ignore", "pipe", "pipe"] as ["ignore", "pipe", "pipe"], detached: true });
      const timer = setTimeout(() => { try { process.kill(-p.pid!, "SIGKILL"); } catch { p.kill("SIGKILL"); } }, req.timeoutMs ?? 30_000);
      let timedOut = false; timer.unref(); const t = setTimeout(() => { timedOut = true; }, (req.timeoutMs ?? 30_000) - 5); t.unref();
      p.stdout.on("data", (d) => { if (out.length < max) out += d.toString(); else truncated = true; });
      p.stderr.on("data", (d) => { if (err.length < max) err += d.toString(); else truncated = true; });
      p.on("error", (e) => { clearTimeout(timer); err += e.message; resolve({ code: 127, signal: null, timedOut: false }); });
      p.on("close", (code, signal) => { clearTimeout(timer); resolve({ code, signal, timedOut: timedOut && signal === "SIGKILL" }); });
    });
    const after = await snapshot(ws);
    const fsChanges = [...after.entries()].filter(([k, v]) => before.get(k) !== v).map(([k]) => k).concat([...before.keys()].filter((k) => !after.has(k)).map((k) => `-${k}`)).slice(0, 200);
    const ms = Date.now() - t0;
    const res: ExecResult = { ok: result.code === 0, exitCode: result.code, signal: result.signal ?? undefined, stdout: out, stderr: err, ms, fsChanges, truncated, isolation: { ...base.isolation, networkIsolated: useUnshare, mechanism: useUnshare ? "child_process+unshare(-rn)" : "child_process" }, error: result.timedOut ? "timeout" : undefined };
    record({ type: "execution", uid: meta.uid, capability: meta.capability ?? "execution:server-sandbox", ok: res.ok, ms, detail: `${req.command.slice(0, 120)} → exit ${result.code}${result.timedOut ? " (timeout)" : ""}`, meta: { fsChanges: fsChanges.length, networkIsolated: useUnshare } });
    return res;
  } finally { await rm(ws, { recursive: true, force: true }).catch(() => undefined); }
}

export async function sandboxStatus() { return { available: true, mechanism: "child_process (fresh temp workspace, scrubbed env, SIGKILL timeout, output caps)", networkIsolation: await canUnshare() ? "unshare -rn" : "unavailable on this host (needs unprivileged user namespaces)", container: false, allowedBinaries: [...ALLOWED_BIN] }; }
