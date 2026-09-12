/**
 * RAVANA · Built-in tool implementations (v0.1).
 *
 * All execution goes through the platform sandbox (src/core/execution/sandbox.ts): fresh temp
 * workspace, scrubbed env, SIGKILL timeout, allow-listed binaries, network off unless requested.
 * Filesystem tools are confined to the per-user RAVANA workspace under <dataDir>/ravana_workspace/
 * (never the repository or home directory) — the LLM never gets an unrestricted shell (spec §14).
 */
import path from "node:path";
import { execute } from "../../execution/sandbox";
import { searchKeyFor, searchWeb } from "@/aetheris/lib/search/tavily";
import { sessionGet, workingGet } from "../memory/stores";
import { searchMemories } from "../memory/retriever";
import type { ToolArgs, ToolResult, RavanaToolRuntime, ToolRuntimeContext } from "./registry";
import { registerTool } from "./registry";
import { TraversalError, workspaceRead, workspaceWrite } from "@/aetheris/lib/workspace";

export const DATA_DIR = () => process.env.AETHERIS_DATA_DIR ?? path.join(process.cwd(), "data");
export const WORKSPACE_ROOT = (uid: string) => path.join(DATA_DIR(), "ravana_workspace", uid);

/** Confine a user-supplied path to a root. Returns the absolute path or null when escaping. */
export function confine(root: string, rel: string): string | null {
  const abs = path.resolve(root, rel);
  const r = path.resolve(root);
  if (abs !== r && !abs.startsWith(r + path.sep)) return null;
  return abs;
}

function cap(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + `\n…[truncated ${s.length - n} chars]` : s;
}

async function memoryTool(ctx: ToolRuntimeContext, args: ToolArgs): Promise<ToolResult> {
  const t0 = Date.now();
  const query = String(args.query ?? "").trim();
  if (!query) return { ok: false, summary: "memory.search needs a query", error: "missing query", ms: 0 };
  const hits = await searchMemories({
    uid: ctx.uid,
    projectId: ctx.projectId ?? null,
    query,
    topK: Number(args.topK ?? 6),
    types: ["episodic", "semantic"],
    taskId: ctx.taskId,
    sessionKey: `ravana:${ctx.uid}`,
    local: { working: workingGet(ctx.taskId) as Record<string, unknown>, session: sessionGet(`ravana:${ctx.uid}`) },
  });
  return {
    ok: true,
    summary: `memory.search: ${hits.length} hit(s) across ${[...new Set(hits.map((h) => h.layer))].join(", ") || "persisted"} layer(s)`,
    data: hits.map((h) => ({ id: h.memory.id, type: h.memory.type, content: h.memory.content.slice(0, 300), importance: h.memory.importance, score: h.score, layer: h.layer })),
    ms: Date.now() - t0,
  };
}

async function webTool(ctx: ToolRuntimeContext, args: ToolArgs): Promise<ToolResult> {
  const t0 = Date.now();
  const query = String(args.query ?? "").trim();
  if (!query) return { ok: false, summary: "web.search needs a query", error: "missing query", ms: 0 };
  const key = searchKeyFor();
  if (!key) return { ok: false, summary: "web.search not configured — set TAVILY_API_KEY", error: "not configured", ms: 0 };
  try {
    const res = await searchWeb(query, key, { maxResults: Number(args.maxResults ?? 5), signal: ctx.signal });
    const results = (res.results ?? []).map((r) => ({ title: r.title, url: r.url, content: cap(r.content ?? "", 600) }));
    return { ok: true, summary: `web.search: ${results.length} result(s)`, data: { query, results }, ms: Date.now() - t0 };
  } catch (e) {
    return { ok: false, summary: `web.search failed: ${(e as Error).message.slice(0, 120)}`, error: (e as Error).message, ms: Date.now() - t0 };
  }
}

async function runCode(args: ToolArgs, ctx: ToolRuntimeContext, lang: "python" | "shell"): Promise<ToolResult> {
  const t0 = Date.now();
  const timeoutMs = Math.min(Number(args.timeoutMs ?? 45_000), 120_000);
  const defaultEntry = lang === "python" ? "main.py" : "run.sh";
  // args.file picks the entry; when running a file map the entry must exist inside it.
  const entry = typeof args.file === "string" && /^[a-zA-Z0-9_\-./]{1,80}$/.test(args.file) && !/(^|\/)\.\.(\/|$)/.test(args.file) ? args.file : defaultEntry;
  const files: Record<string, string> = {};
  if (typeof args.code === "string" && args.code.trim()) {
    files[entry] = args.code;
  }
  if (args.files && typeof args.files === "object") {
    for (const [name, content] of Object.entries(args.files as Record<string, unknown>)) {
      if (!/^[a-zA-Z0-9_\-./]{1,80}$/.test(name) || /(^|\/)\.\.(\/|$)/.test(name)) continue;
      files[name] = String(content);
    }
  }
  if (!Object.keys(files).length) return { ok: false, summary: `${lang}.execute needs code or files`, error: "no code", ms: 0 };
  if (!files[entry]) return { ok: false, summary: `${lang}.execute: entry file "${entry}" not found in files`, error: `missing entry file ${entry}`, ms: 0 };

  const argv = Array.isArray(args.args) ? args.args.map((a) => String(a)) : [];
  const quoted = (s: string) => (lang === "shell" ? `'${s.replace(/'/g, "'\\''")}'` : `"${s.replace(/"/g, '\\"')}"`);
  const command = lang === "python" ? `python3 ${entry}${argv.length ? " " + argv.map(quoted).join(" ") : ""}` : `bash ${entry}${argv.length ? " " + argv.map(quoted).join(" ") : ""}`;
  const res = await execute(
    { command, files, timeoutMs, network: false, maxOutput: 120_000 },
    { uid: ctx.uid, capability: `ravana:tool:${lang}.execute` },
  );
  const output = cap(`${res.stdout}\n${res.stderr}`.trim(), 8000);
  return {
    ok: res.ok && res.exitCode === 0,
    summary: `${lang}.execute → exit ${res.exitCode} in ${res.ms}ms`,
    output,
    data: { exitCode: res.exitCode, ms: res.ms, isolation: res.isolation, fsChanges: res.fsChanges },
    files,
    error: res.ok ? undefined : output.slice(-2000),
    ms: Date.now() - t0,
  };
}

async function filesystemRead(ctx: ToolRuntimeContext, args: ToolArgs): Promise<ToolResult> {
  const t0 = Date.now();
  const rel = String(args.path ?? "");
  try {
    const content = await workspaceRead(ctx.uid, rel);
    return { ok: true, summary: `filesystem.read ${rel} (${content.length} chars)`, output: cap(content, 20_000), ms: Date.now() - t0 };
  } catch (e) {
    if (e instanceof TraversalError) return { ok: false, summary: "filesystem.read refused: path escapes the RAVANA workspace", error: "path traversal refused", ms: 0 };
    return { ok: false, summary: `filesystem.read failed: ${(e as Error).message}`, error: (e as Error).message, ms: Date.now() - t0 };
  }
}

async function filesystemWrite(ctx: ToolRuntimeContext, args: ToolArgs): Promise<ToolResult> {
  const t0 = Date.now();
  const rel = String(args.path ?? "");
  try {
    await workspaceWrite(ctx.uid, rel, String(args.content ?? ""));
    return { ok: true, summary: `filesystem.write ${rel}`, ms: Date.now() - t0 };
  } catch (e) {
    if (e instanceof TraversalError) return { ok: false, summary: "filesystem.write refused: path escapes the RAVANA workspace", error: "path traversal refused", ms: 0 };
    return { ok: false, summary: `filesystem.write failed: ${(e as Error).message}`, error: (e as Error).message, ms: Date.now() - t0 };
  }
}

let booted = false;
/** Register built-ins once (idempotent — safe from any route or the engine). */
export function bootTools() {
  if (booted) return;
  booted = true;
  const t = (t: RavanaToolRuntime) => registerTool(t);
  t({
    name: "memory.search",
    description: "Search RAVANA memory (episodic + semantic, layered retrieval with reranking).",
    category: "memory",
    schema: { type: "object", required: ["query"], properties: { query: { type: "string" }, topK: { type: "number" }, projectId: { type: "string" } } },
    permission: "read_only",
    requiresConfirmation: false,
    timeoutMs: 10_000,
    sandboxed: true,
    status: "implemented",
    run: (ctx, args) => memoryTool(ctx, args),
  });
  t({
    name: "web.search",
    description: "Web search with citations (Tavily). Requires TAVILY_API_KEY.",
    category: "search",
    schema: { type: "object", required: ["query"], properties: { query: { type: "string" }, maxResults: { type: "number" } } },
    permission: "read_only",
    requiresConfirmation: false,
    timeoutMs: 30_000,
    sandboxed: false,
    status: searchKeyFor() ? "implemented" : "not_configured",
    note: searchKeyFor() ? undefined : "set TAVILY_API_KEY in .env.local",
    run: (ctx, args) => webTool(ctx, args),
  });
  t({
    name: "python.execute",
    description: "Run Python code (or files) inside the isolated sandbox — fresh temp workspace, no network, no secrets.",
    category: "execution",
    schema: { type: "object", properties: { code: { type: "string" }, files: { type: "object" }, file: { type: "string" }, args: { type: "array", items: { type: "string" } }, timeoutMs: { type: "number" } } },
    permission: "safe_write",
    requiresConfirmation: false,
    timeoutMs: 60_000,
    sandboxed: true,
    status: "implemented",
    run: (ctx, args) => runCode(args, ctx, "python"),
  });
  t({
    name: "shell.execute",
    description: "Run a shell command inside the isolated sandbox. Deny-list + allow-list enforced by the platform sandbox.",
    category: "execution",
    schema: { type: "object", required: ["command"], properties: { command: { type: "string" }, files: { type: "object" }, timeoutMs: { type: "number" } } },
    permission: "full_workspace",
    requiresConfirmation: true,
    timeoutMs: 60_000,
    sandboxed: true,
    status: "implemented",
    run: (ctx, args) => runCode({ ...args, code: args.code ?? `#!/bin/bash\nset -e\n${String(args.command ?? "")}`, file: "run.sh" }, ctx, "shell"),
  });
  t({
    name: "filesystem.read",
    description: "Read a text file from the per-user RAVANA workspace (never outside it).",
    category: "filesystem",
    schema: { type: "object", required: ["path"], properties: { path: { type: "string" } } },
    permission: "read_only",
    requiresConfirmation: false,
    timeoutMs: 10_000,
    sandboxed: true,
    status: "implemented",
    run: (ctx, args) => filesystemRead(ctx, args),
  });
  t({
    name: "filesystem.write",
    description: "Write a text file inside the per-user RAVANA workspace (never outside it).",
    category: "filesystem",
    schema: { type: "object", required: ["path", "content"], properties: { path: { type: "string" }, content: { type: "string" } } },
    permission: "safe_write",
    requiresConfirmation: false,
    timeoutMs: 10_000,
    sandboxed: true,
    status: "implemented",
    run: (ctx, args) => filesystemWrite(ctx, args),
  });
}


