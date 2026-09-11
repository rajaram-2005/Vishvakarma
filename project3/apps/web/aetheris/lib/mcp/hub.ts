import { traced } from "@/aetheris/core/observability/events";
import { classifyTool } from "@/aetheris/core/mcp/gateway";
import { authorize, principalFor } from "@/aetheris/core/policy/permissions";
/**
 * Aetheris MCP Hub — every connector behind ONE MCP server.
 *
 * Tool names are namespaced `<connectorId>__<tool>` (double underscore, MCP-safe). Remote MCP
 * servers are proxied (tools/list cached), gateway APIs run in-process, and the Factory is bound
 * directly. Plus meta-tools: hub__connectors, hub__search_tools, hub__enable.
 *
 * Credentials come from (highest priority first):
 *   1. request header  X-Aetheris-Cred-<connectorId>: <credential>
 *   2. stored per-user credentials (sealed at rest, POST /api/mcp/hub/credentials)
 *   3. per-user OAuth tokens (aetheris_mcp_tokens cookie, when called from the browser)
 */
import { CONNECTORS, connectorById, type Connector } from "./catalog";
import { apiById } from "@/aetheris/lib/gateway/apis";
import { executeTool, toInputSchema } from "@/aetheris/lib/gateway/engine";
import { McpClient, type McpTool } from "./client";
import { resolveServer, type AgentContext } from "./agent";
import { store } from "@/aetheris/lib/store";
import { seal, unseal } from "@/aetheris/lib/crypto";

export const SEP = "__";

export interface HubContext extends AgentContext {
  uid: string;
  /** single-use confirmation token for tools that require it (delete/pay/deploy…). */
  confirmationToken?: string;
  /** connectorId → credential (already merged from header/stored). */
  creds: Record<string, string>;
  /** Restrict to these connector ids (undefined = all). */
  only?: string[];
}

// ---- per-user stored credentials -------------------------------------------------------------
const CRED_COLL = "hubcreds";
type CredMap = Record<string, string>; // connectorId → sealed credential

export async function getStoredCreds(uid: string): Promise<Record<string, string>> {
  const m = (await store.get<CredMap>(CRED_COLL, uid)) ?? {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(m)) { const p = unseal(v); if (p) out[k] = p; }
  return out;
}
export async function setStoredCred(uid: string, connectorId: string, credential: string | null): Promise<string[]> {
  const m = await store.update<CredMap>(CRED_COLL, uid, (cur) => {
    const next = { ...(cur ?? {}) };
    if (credential) next[connectorId] = seal(credential); else delete next[connectorId];
    return next;
  });
  return Object.keys(m);
}

// ---- remote tool-list cache --------------------------------------------------------------------
const remoteCache = new Map<string, { at: number; tools: McpTool[] }>();
const CACHE_MS = 10 * 60_000;

async function remoteTools(c: Connector, headers?: Record<string, string>): Promise<McpTool[]> {
  const key = c.id + (headers ? ":auth" : "");
  const hit = remoteCache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.tools;
  const client = new McpClient({ url: c.url, headers }, 12_000);
  const tools = await client.listTools();
  remoteCache.set(key, { at: Date.now(), tools });
  return tools;
}

function headersFor(c: Connector, ctx: HubContext): Record<string, string> | undefined {
  const oauth = ctx.oauthTokens?.[c.id];
  if (oauth) return { Authorization: `Bearer ${oauth}` };
  const cred = ctx.creds[c.id];
  if (!cred || !c.auth) return undefined;
  return { [c.auth.header]: `${c.auth.prefix ?? ""}${cred}` };
}

/** Is this connector usable right now (public, or we hold a credential/token)? */
export function isReady(c: Connector, ctx: HubContext): boolean {
  if (!c.auth && !c.oauth) return true;
  return !!(ctx.creds[c.id] || ctx.oauthTokens?.[c.id]);
}

export interface HubTool { name: string; description?: string; inputSchema: Record<string, unknown>; connector: string }

const META_TOOLS: HubTool[] = [
  { connector: "hub", name: `hub${SEP}connectors`, description: "List all connectors in the Aetheris hub with their status (ready / needs credential). Call this first to discover what you can do.", inputSchema: { type: "object", properties: { category: { type: "string", description: "optional category filter" }, readyOnly: { type: "boolean" } } } },
  { connector: "hub", name: `hub${SEP}search_tools`, description: "Search across ALL connectors' tools by keyword (e.g. 'send email', 'create issue', 'weather'). Returns fully-qualified tool names you can call.", inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } },
  { connector: "hub", name: `hub${SEP}list_tools`, description: "List the tools of one connector (loads them lazily for remote MCP servers).", inputSchema: { type: "object", properties: { connector: { type: "string" } }, required: ["connector"] } },
];

/** Tools that are cheap to enumerate synchronously: meta + all gateway APIs (+ factory). Remote servers are listed lazily unless `eager`. */
export async function listHubTools(ctx: HubContext, opts: { eager?: boolean; readyOnly?: boolean } = {}): Promise<{ tools: HubTool[]; skipped: { connector: string; reason: string }[] }> {
  const tools: HubTool[] = [...META_TOOLS];
  const skipped: { connector: string; reason: string }[] = [];
  const list = CONNECTORS.filter((c) => !ctx.only || ctx.only.includes(c.id));
  await Promise.all(list.map(async (c) => {
    const ready = isReady(c, ctx);
    if (opts.readyOnly && !ready) return;
    if (c.kind === "gateway") {
      const api = apiById(c.id);
      if (!api) return skipped.push({ connector: c.id, reason: "gateway definition missing" });
      for (const t of api.tools) tools.push({ connector: c.id, name: `${c.id}${SEP}${t.name}`, description: `[${c.name}${ready ? "" : " · needs credential"}] ${t.description}`, inputSchema: toInputSchema(t) });
      return;
    }
    if (!opts.eager) return;
    if (!ready && c.auth) return skipped.push({ connector: c.id, reason: "needs credential" });
    try {
      const rt = await remoteTools(c, headersFor(c, ctx));
      for (const t of rt) tools.push({ connector: c.id, name: `${c.id}${SEP}${t.name}`, description: `[${c.name}] ${t.description ?? ""}`, inputSchema: t.inputSchema });
    } catch (e) { skipped.push({ connector: c.id, reason: (e as Error).message.slice(0, 120) }); }
  }));
  return { tools, skipped };
}

export async function callHubTool(ctx: HubContext, name: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<string> {
  return traced({ type: "mcp", uid: ctx.uid, capability: `tool:${name.replace(SEP, ".")}` }, () => callHubToolInner(ctx, name, args, signal));
}
async function callHubToolInner(ctx: HubContext, name: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<string> {
  const i = name.indexOf(SEP);
  if (i === -1) throw new Error(`tool name must be <connector>${SEP}<tool>; got ${name}`);
  const cid = name.slice(0, i); const tool = name.slice(i + SEP.length);

  if (cid === "hub") {
    if (tool === "connectors") {
      const cat = typeof args.category === "string" ? args.category : undefined;
      const rows = CONNECTORS.filter((c) => (!cat || c.category === cat) && (!args.readyOnly || isReady(c, ctx)))
        .map((c) => `${c.id} · ${c.name} · ${c.category} · ${c.kind} · ${isReady(c, ctx) ? "READY" : `needs ${c.oauth ? "OAuth sign-in" : c.auth?.label ?? "credential"}`}${c.premium ? " · PRO" : ""}\n   ${c.description}`);
      return rows.join("\n") || "no connectors";
    }
    if (tool === "search_tools") {
      const q = String(args.query ?? "").toLowerCase().split(/\s+/).filter(Boolean);
      const { tools } = await listHubTools(ctx, { eager: false });
      const scored = tools.filter((t) => t.connector !== "hub").map((t) => ({ t, s: q.reduce((n, w) => n + (t.name.toLowerCase().includes(w) ? 2 : 0) + ((t.description ?? "").toLowerCase().includes(w) ? 1 : 0), 0) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 25);
      const remoteHint = CONNECTORS.filter((c) => c.kind === "remote" && q.some((w) => c.name.toLowerCase().includes(w) || c.description.toLowerCase().includes(w))).slice(0, 8).map((c) => `${c.id} (remote MCP — call hub${SEP}list_tools to load its tools)`);
      return [...scored.map((x) => `${x.t.name}: ${x.t.description}`), ...remoteHint].join("\n") || "no matching tools";
    }
    if (tool === "list_tools") {
      const c = connectorById(String(args.connector ?? ""));
      if (!c) throw new Error("unknown connector");
      const { tools } = await listHubTools({ ...ctx, only: [c.id] }, { eager: true });
      return tools.filter((t) => t.connector === c.id).map((t) => `${t.name}: ${t.description}\n  schema: ${JSON.stringify(t.inputSchema)}`).join("\n") || "no tools (missing credential?)";
    }
    throw new Error(`unknown hub tool ${tool}`);
  }

  const c = connectorById(cid);
  if (!c) throw new Error(`unknown connector ${cid}`);
  if (ctx.only && !ctx.only.includes(cid)) throw new Error(`connector ${cid} is not enabled for this session`);
  // Same execution policy as user-registered MCP servers: classify the tool by verb, authorize, audit.
  const cls = classifyTool(tool);
  const d = authorize({ principal: principalFor(ctx.uid), capabilityId: `tool:${cid}.${tool}`, required: cls.permission, requiresConfirmation: cls.requiresConfirmation, confirmationToken: ctx.confirmationToken });
  if (!d.allow) throw new Error(`${d.reason} (permission: ${cls.permission}${cls.requiresConfirmation ? ", confirmation required — POST /api/permissions {capabilityId:\"tool:" + cid + "." + tool + "\", issue:true} and pass confirmationToken" : ""})`);

  if (cid === "aetheris-factory") {
    if (!ctx.github) return "Error: connect GitHub in Aetheris (Factory tab) first.";
    const { runFactory } = await import("@/aetheris/lib/factory/pipeline");
    const lines: string[] = []; let verdict = "";
    await runFactory(ctx.github, String(args.task ?? ""), (e) => {
      if (e.type === "step" && e.status !== "start") lines.push(`${e.step}: ${e.status}${e.detail ? ` — ${e.detail}` : ""}`);
      if (e.type === "result") verdict = `CI ${e.conclusion}. Run: ${e.runUrl}\n\n${e.report}`;
      if (e.type === "error") verdict = `Factory error: ${e.message}`;
    }, { signal });
    return `${lines.join("\n")}\n\n${verdict}`;
  }

  if (c.kind === "gateway") {
    const api = apiById(cid);
    const t = api?.tools.find((x) => x.name === tool);
    if (!api || !t) throw new Error(`unknown tool ${name}`);
    if (c.auth && !ctx.creds[cid]) throw new Error(`${c.name} needs a credential (${c.auth.label}). Add it in Aetheris → Apps, or send header X-Aetheris-Cred-${cid}.`);
    return executeTool(api, t, args, ctx.creds[cid], signal);
  }

  const r = resolveServer({ id: cid, credential: ctx.creds[cid] }, ctx.oauthTokens?.[cid]);
  if (!r) throw new Error(`no URL for ${cid}`);
  if (c.auth && !r.headers) throw new Error(`${c.name} needs ${c.oauth ? "an OAuth sign-in" : c.auth.label}. Connect it in Aetheris → Apps.`);
  const client = new McpClient({ url: r.url, headers: r.headers }, 60_000);
  return client.callTool(tool, args);
}

// ---- MCP JSON-RPC surface ------------------------------------------------------------------------
interface Rpc { jsonrpc: "2.0"; id?: number | string; method: string; params?: Record<string, unknown> }

export async function handleHubRpc(ctx: HubContext, msg: Rpc, signal?: AbortSignal): Promise<unknown | null> {
  const reply = (result: unknown) => ({ jsonrpc: "2.0", id: msg.id, result });
  const fail = (code: number, message: string) => ({ jsonrpc: "2.0", id: msg.id, error: { code, message } });
  switch (msg.method) {
    case "initialize":
      return reply({ protocolVersion: "2025-03-26", capabilities: { tools: { listChanged: false } }, serverInfo: { name: "aetheris-hub", version: "1.0.0" }, instructions: `Aetheris MCP Hub: ${CONNECTORS.length} connectors behind one server. Tools are named <connector>${SEP}<tool>. Start with hub${SEP}search_tools or hub${SEP}connectors.` });
    case "notifications/initialized":
    case "ping":
      return msg.id === undefined ? null : reply({});
    case "tools/list": {
      const { tools } = await listHubTools(ctx, { eager: msg.params?.eager === true });
      return reply({ tools: tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });
    }
    case "tools/call": {
      const name = String(msg.params?.name ?? "");
      const { _confirmationToken, ...args } = (msg.params?.arguments ?? {}) as Record<string, unknown>;
      const c2 = typeof _confirmationToken === "string" ? { ...ctx, confirmationToken: _confirmationToken } : ctx;
      try { return reply({ content: [{ type: "text", text: await callHubTool(c2, name, args, signal) }], isError: false }); }
      catch (e) { return reply({ content: [{ type: "text", text: (e as Error).message }], isError: true }); }
    }
    default:
      return msg.id === undefined ? null : fail(-32601, `method not found: ${msg.method}`);
  }
}

export function hubSummary() {
  const gw = CONNECTORS.filter((c) => c.kind === "gateway").length;
  return { connectors: CONNECTORS.length, gateway: gw, remote: CONNECTORS.length - gw, categories: [...new Set(CONNECTORS.map((c) => c.category))] };
}
