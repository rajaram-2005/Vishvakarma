/**
 * Aetheris MCP Gateway — turns declarative REST API definitions into MCP servers.
 *
 * Each `ApiDef` describes an upstream API (base URL, auth style) and a set of tools. A tool
 * maps JSON arguments onto an HTTP request via a small template language:
 *   path:  "/repos/{owner}/{repo}/issues"     → {name} substituted + URL-encoded from args
 *   query: { q: "{query}", per_page: 20 }      → literal or template values; unset args dropped
 *   body:  { text: "{message}", channel: "{channel}" }   → same, sent as JSON
 * Responses are returned to the model as pretty JSON (truncated).
 *
 * The gateway speaks MCP Streamable HTTP at /api/gateway/<id> and can also be invoked
 * in-process by the agent (no self-HTTP round trip).
 */

export type ParamType = "string" | "number" | "integer" | "boolean";

export interface ToolParam { type: ParamType; description?: string; required?: boolean; enum?: string[] }

export interface ToolDef {
  name: string;
  description: string;
  params?: Record<string, ToolParam>;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  query?: Record<string, string | number | boolean>;
  body?: Record<string, unknown>;
  /** Send body as form-encoded instead of JSON */
  form?: boolean;
  headers?: Record<string, string>;
  /** Optional hook to derive/normalise arguments before templating. */
  prepare?: (args: Record<string, unknown>) => Record<string, unknown>;
}

export interface ApiDef {
  id: string;
  name: string;
  baseUrl: string;
  /** How the user's credential is applied upstream. */
  auth:
    | { in: "header"; name: string; prefix?: string }
    | { in: "query"; name: string }
    | { in: "basic"; user?: string }       // credential is "user:pass" (or password when user is fixed)
    | { in: "arg"; name: string }          // credential injected as a tool argument (e.g. Telegram's /bot{token}/…)
    | { in: "none" };
  headers?: Record<string, string>;
  tools: ToolDef[];
}

// ---- templating ---------------------------------------------------------------------------

const TPL = /\{([a-zA-Z0-9_]+)\}/g;

function fill(tpl: string, args: Record<string, unknown>, encode = false): string | undefined {
  let missing = false;
  const out = tpl.replace(TPL, (_m, k: string) => {
    const v = args[k];
    if (v === undefined || v === null || v === "") { missing = true; return ""; }
    return encode ? encodeURIComponent(String(v)) : String(v);
  });
  return missing ? undefined : out;
}

function fillDeep(v: unknown, args: Record<string, unknown>): unknown {
  if (typeof v === "string") {
    const m = v.match(/^\{([a-zA-Z0-9_]+)\}$/);
    if (m) return args[m[1]]; // whole-value template keeps original type
    return fill(v, args);
  }
  if (Array.isArray(v)) return v.map((x) => fillDeep(x, args)).filter((x) => x !== undefined);
  if (v && typeof v === "object") {
    const o: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      const y = fillDeep(x, args);
      if (y !== undefined) o[k] = y;
    }
    return o;
  }
  return v;
}

export function toInputSchema(t: ToolDef) {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const [k, p] of Object.entries(t.params ?? {})) {
    properties[k] = { type: p.type, ...(p.description ? { description: p.description } : {}), ...(p.enum ? { enum: p.enum } : {}) };
    if (p.required) required.push(k);
  }
  return { type: "object", properties, ...(required.length ? { required } : {}) };
}

// ---- execution ------------------------------------------------------------------------------

export class GatewayError extends Error {
  constructor(message: string, public readonly status?: number) { super(message); this.name = "GatewayError"; }
}

export async function executeTool(api: ApiDef, tool: ToolDef, rawArgs: Record<string, unknown>, credential?: string, signal?: AbortSignal): Promise<string> {
  let args = { ...rawArgs };
  if (api.auth.in === "arg") {
    if (!credential) throw new GatewayError(`${api.name} requires a credential`, 401);
    args[api.auth.name] = credential;
  }
  if (tool.prepare) args = tool.prepare(args);
  for (const [k, p] of Object.entries(tool.params ?? {})) {
    if (p.required && (args[k] === undefined || args[k] === "")) throw new GatewayError(`missing required argument "${k}"`);
  }
  const rawPath = tool.path.replace(TPL, (m, k: string) => (typeof args[k] === "string" && /^https?:\/\//.test(args[k] as string) ? `\u0000${k}\u0000` : m));
  let path = fill(rawPath, args, true);
  if (path === undefined) throw new GatewayError(`missing argument for path ${tool.path}`);
  path = path.replace(/\u0000([a-zA-Z0-9_]+)\u0000/g, (_m, k: string) => String(args[k]));
  const url = new URL(path.startsWith("http") ? path : api.baseUrl.replace(/\/$/, "") + path);
  for (const [k, v] of Object.entries(tool.query ?? {})) {
    const val = typeof v === "string" ? fill(v, args) : String(v);
    if (val !== undefined) url.searchParams.set(k, val);
  }

  const headers: Record<string, string> = { Accept: "application/json", "User-Agent": "aetheris-one-gateway", ...(api.headers ?? {}) };
  for (const [k, v] of Object.entries(tool.headers ?? {})) {
    const val = fill(v, args);
    if (val !== undefined) headers[k] = val;
  }
  if (api.auth.in !== "none" && api.auth.in !== "arg" && !credential) throw new GatewayError(`${api.name} requires a credential`, 401);
  if (api.auth.in === "header") headers[api.auth.name] = `${api.auth.prefix ?? ""}${credential}`;
  if (api.auth.in === "query") url.searchParams.set(api.auth.name, credential!);
  if (api.auth.in === "basic") {
    const pair = api.auth.user ? `${api.auth.user}:${credential}` : credential!;
    headers.Authorization = `Basic ${Buffer.from(pair).toString("base64")}`;
  }

  const method = tool.method ?? (tool.body ? "POST" : "GET");
  let body: string | undefined;
  if (tool.body && method !== "GET") {
    let filled = fillDeep(tool.body, args) as Record<string, unknown>;
    // { _raw: "{json_arg}" } → send the user's JSON verbatim as the body
    if (typeof filled._raw === "string" && Object.keys(filled).length === 1) {
      try { filled = JSON.parse(filled._raw); } catch { throw new GatewayError("body must be valid JSON"); }
    }
    if (tool.form) {
      headers["Content-Type"] = "application/x-www-form-urlencoded";
      body = new URLSearchParams(Object.entries(filled).map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)])).toString();
    } else {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(filled);
    }
  }

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 30_000);
  signal?.addEventListener("abort", () => ctrl.abort());
  let res: Response;
  try {
    res = await fetch(url, { method, headers, body, signal: ctrl.signal, cache: "no-store" });
  } catch (e) {
    throw new GatewayError(`${api.name}: ${(e as Error).message}`);
  } finally {
    clearTimeout(t);
  }
  const text = await res.text();
  if (!res.ok) throw new GatewayError(`${api.name} ${method} ${url.pathname} → ${res.status}: ${text.slice(0, 400)}`, res.status);
  let pretty = text;
  try { pretty = JSON.stringify(JSON.parse(text), null, 1); } catch { /* not JSON */ }
  return pretty.length > 12_000 ? pretty.slice(0, 12_000) + "\n…(truncated)" : pretty;
}

// ---- MCP JSON-RPC handler -------------------------------------------------------------------

interface Rpc { jsonrpc: "2.0"; id?: number | string; method: string; params?: Record<string, unknown> }

export async function handleRpc(api: ApiDef, msg: Rpc, credential?: string, signal?: AbortSignal): Promise<unknown | null> {
  const reply = (result: unknown) => ({ jsonrpc: "2.0", id: msg.id, result });
  const fail = (code: number, message: string) => ({ jsonrpc: "2.0", id: msg.id, error: { code, message } });
  switch (msg.method) {
    case "initialize":
      return reply({ protocolVersion: "2025-03-26", capabilities: { tools: {} }, serverInfo: { name: `aetheris-gateway/${api.id}`, version: "0.1.0" } });
    case "notifications/initialized":
    case "ping":
      return msg.id === undefined ? null : reply({});
    case "tools/list":
      return reply({ tools: api.tools.map((t) => ({ name: t.name, description: t.description, inputSchema: toInputSchema(t) })) });
    case "tools/call": {
      const name = msg.params?.name as string;
      const args = (msg.params?.arguments ?? {}) as Record<string, unknown>;
      const tool = api.tools.find((t) => t.name === name);
      if (!tool) return fail(-32602, `unknown tool ${name}`);
      try {
        const text = await executeTool(api, tool, args, credential, signal);
        return reply({ content: [{ type: "text", text }], isError: false });
      } catch (e) {
        return reply({ content: [{ type: "text", text: (e as Error).message }], isError: true });
      }
    }
    default:
      return msg.id === undefined ? null : fail(-32601, `method not found: ${msg.method}`);
  }
}
