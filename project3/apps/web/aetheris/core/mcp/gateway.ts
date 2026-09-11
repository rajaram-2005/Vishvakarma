/**
 * MCP Gateway (Phase 7) — user-registered MCP servers with health, versioning, schema validation
 * and permission classification. Complements the static catalog in src/lib/mcp (110 connectors).
 *
 *   MCPRegistry (this file) · MCPServer · MCPTool · MCPManifest · MCPHealth · MCPPermission
 *
 * Any Streamable-HTTP MCP server URL can be added per user. On registration the gateway runs
 * initialize + tools/list, stores the manifest (server info/version + tool schemas), classifies
 * every tool's permission level from its name/description, and records health. Calls validate
 * arguments against the stored JSON schema before dispatch and are audited.
 */
import { randomBytes } from "node:crypto";
import { store } from "@/aetheris/lib/store";
import { McpClient } from "@/aetheris/lib/mcp/client";
import { record, traced } from "../observability/events";
import type { SecurityLevel } from "../capabilities/types";
import { ssrfCheck } from "../security/guard";

export interface McpToolManifest { name: string; description?: string; inputSchema: Record<string, unknown>; permission: SecurityLevel; requiresConfirmation: boolean }
export interface McpServerRecord {
  id: string; uid: string; name: string; url: string; headers?: Record<string, string>; enabled: boolean;
  manifest?: { protocolVersion?: string; serverName?: string; serverVersion?: string; tools: McpToolManifest[]; fetchedAt: number; hash: string };
  health: { state: "unknown" | "healthy" | "degraded" | "down"; lastCheck?: number; latencyMs?: number; consecutiveFailures: number; lastError?: string; calls: number; failures: number };
  versions: { at: number; hash: string; toolCount: number; note: string }[];
  createdAt: number; updatedAt: number;
}
const COL = "mcp_servers"; const LIMIT = 40;

/** Classify a tool's permission from its name/description. Pure; tested. */
export function classifyTool(name: string, description = ""): { permission: SecurityLevel; requiresConfirmation: boolean } {
  const s = `${name} ${description}`.toLowerCase().replace(/[_\-.]+/g, " ");
  if (/\b(delete|remove|destroy|drop|purge|wipe|revoke|terminate|kill)\b/.test(s)) return { permission: "safe_write", requiresConfirmation: true };
  if (/\b(pay|transfer|charge|refund|withdraw|deploy|shutdown|reboot|actuate|move|rotate|open valve|close valve)\b/.test(s)) return { permission: "full_workspace", requiresConfirmation: true };
  if (/\b(create|send|post|write|update|set|put|patch|insert|upload|publish|add|modify|edit|execute|run|start|stop|enable|disable|assign|schedule|merge|push|commit)\b/.test(s)) return { permission: "safe_write", requiresConfirmation: false };
  return { permission: "read_only", requiresConfirmation: false };
}

/** Minimal JSON-schema argument validation (types, required, enum). Pure; tested. */
export function validateArgs(schema: Record<string, unknown> | undefined, args: Record<string, unknown>): string[] {
  const errs: string[] = []; if (!schema) return errs;
  const props = (schema.properties ?? {}) as Record<string, { type?: string | string[]; enum?: unknown[] }>;
  for (const r of (schema.required as string[] | undefined) ?? []) if (args[r] === undefined || args[r] === null || args[r] === "") errs.push(`missing required "${r}"`);
  for (const [k, v] of Object.entries(args)) {
    const p = props[k]; if (!p) { if (schema.additionalProperties === false) errs.push(`unexpected "${k}"`); continue; }
    const types = Array.isArray(p.type) ? p.type : p.type ? [p.type] : [];
    const actual = Array.isArray(v) ? "array" : v === null ? "null" : typeof v === "number" ? (Number.isInteger(v) ? "integer" : "number") : typeof v;
    if (types.length && !types.some((t) => t === actual || (t === "number" && actual === "integer"))) errs.push(`"${k}" should be ${types.join("|")}, got ${actual}`);
    if (p.enum && !p.enum.includes(v)) errs.push(`"${k}" must be one of ${p.enum.join(", ")}`);
  }
  return errs;
}
const hashOf = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return (h >>> 0).toString(16); };

export async function listServers(uid: string) { return Object.values(await store.all<McpServerRecord>(COL)).filter((s) => s.uid === uid).sort((a, b) => b.updatedAt - a.updatedAt); }
export const getServer = (id: string) => store.get<McpServerRecord>(COL, id);
export async function removeServer(uid: string, id: string) { const s = await getServer(id); if (!s || s.uid !== uid) return false; await store.remove(COL, id); return true; }

/** Register (or re-register) a server: probes it and stores manifest/health. Never fakes success. */
export async function registerServer(uid: string, input: { name?: string; url: string; headers?: Record<string, string>; id?: string }): Promise<McpServerRecord> {
  if (!/^https?:\/\//.test(input.url)) throw new Error("url must be http(s)");
  const ss = await ssrfCheck(input.url, { allowHttp: true }); if (!ss.ok) throw new Error(`url rejected: ${ss.reason} (set AETHERIS_ALLOW_PRIVATE_URLS=1 for self-hosted LAN servers)`);
  if (!input.id && (await listServers(uid)).length >= LIMIT) throw new Error(`limit of ${LIMIT} servers`);
  const existing = input.id ? await getServer(input.id) : undefined;
  if (input.id && (!existing || existing.uid !== uid)) throw new Error("not found");
  const rec: McpServerRecord = existing ?? { id: randomBytes(5).toString("hex"), uid, name: "", url: "", enabled: true, health: { state: "unknown", consecutiveFailures: 0, calls: 0, failures: 0 }, versions: [], createdAt: Date.now(), updatedAt: Date.now() };
  rec.name = (input.name ?? existing?.name ?? new URL(input.url).hostname).slice(0, 60); rec.url = input.url; rec.headers = input.headers; rec.updatedAt = Date.now();
  await refresh(rec);
  await store.set(COL, rec.id, rec);
  return rec;
}

/** Health check + manifest refresh (initialize + tools/list). Records a version when tools change. */
export async function refresh(rec: McpServerRecord): Promise<McpServerRecord> {
  const t0 = Date.now();
  try {
    const client = new McpClient({ url: rec.url, headers: rec.headers }, 15_000);
    const tools = await client.listTools();
    const manifestTools: McpToolManifest[] = tools.map((t) => ({ name: t.name, description: t.description, inputSchema: (t.inputSchema ?? { type: "object" }) as Record<string, unknown>, ...classifyTool(t.name, t.description) }));
    const hash = hashOf(JSON.stringify(manifestTools.map((t) => [t.name, t.inputSchema])));
    if (rec.manifest?.hash !== hash) rec.versions.push({ at: Date.now(), hash, toolCount: manifestTools.length, note: rec.manifest ? `tools changed (${rec.manifest.tools.length} → ${manifestTools.length})` : "first manifest" });
    rec.manifest = { tools: manifestTools, fetchedAt: Date.now(), hash };
    rec.health = { ...rec.health, state: "healthy", lastCheck: Date.now(), latencyMs: Date.now() - t0, consecutiveFailures: 0, lastError: undefined };
    record({ type: "mcp", uid: rec.uid, capability: `mcpserver:${rec.id}`, ok: true, ms: Date.now() - t0, detail: `health ok · ${manifestTools.length} tools` });
  } catch (e) {
    const f = rec.health.consecutiveFailures + 1;
    rec.health = { ...rec.health, state: f >= 3 ? "down" : "degraded", lastCheck: Date.now(), latencyMs: Date.now() - t0, consecutiveFailures: f, lastError: (e as Error).message.slice(0, 200) };
    record({ type: "mcp", uid: rec.uid, capability: `mcpserver:${rec.id}`, ok: false, ms: Date.now() - t0, detail: rec.health.lastError });
  }
  rec.versions = rec.versions.slice(-20);
  return rec;
}

/** Validate + call a tool on a registered server. Permission checks happen in the route (policy layer). */
export async function callServerTool(rec: McpServerRecord, tool: string, args: Record<string, unknown>, _signal?: AbortSignal): Promise<string> {
  const t = rec.manifest?.tools.find((x) => x.name === tool);
  if (!t) throw new Error(`unknown tool ${tool} on ${rec.name}`);
  const errs = validateArgs(t.inputSchema, args); if (errs.length) throw new Error(`invalid arguments: ${errs.join("; ")}`);
  return traced({ type: "mcp", uid: rec.uid, capability: `mcpserver:${rec.id}.${tool}` }, async () => {
    try { const out = await new McpClient({ url: rec.url, headers: rec.headers }, 60_000).callTool(tool, args); rec.health.calls++; return out; }
    catch (e) { rec.health.calls++; rec.health.failures++; throw e; }
    finally { await store.set(COL, rec.id, rec); }
  });
}

/** Health sweep for all enabled servers (called by the scheduler tick). */
export async function sweepHealth(): Promise<number> {
  const all = Object.values(await store.all<McpServerRecord>(COL)).filter((s) => s.enabled && (!s.health.lastCheck || Date.now() - s.health.lastCheck > 10 * 60_000));
  for (const s of all) { await refresh(s); await store.set(COL, s.id, s); }
  return all.length;
}
export async function gatewaySummary() { const all = Object.values(await store.all<McpServerRecord>(COL)); return { servers: all.length, healthy: all.filter((s) => s.health.state === "healthy").length, down: all.filter((s) => s.health.state === "down").length, tools: all.reduce((n, s) => n + (s.manifest?.tools.length ?? 0), 0) }; }
