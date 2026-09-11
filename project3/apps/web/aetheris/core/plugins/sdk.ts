/**
 * Plugin SDK (Phase 21) — the smallest contract that makes a new capability discoverable, callable,
 * permissioned, observable, testable and replaceable.
 *
 *   definePlugin({ id, capabilities: [...], handlers: { "<capabilityId>": async (args, ctx) => result } })
 *
 * A plugin registers a CapabilitySource (so it appears in /api/capabilities and /api/tools) and typed
 * handlers invoked through POST /api/plugins/:capabilityId. The route enforces the capability's
 * security_level / requires_confirmation via the same authorize() every built-in uses, and records events.
 * Plugins are plain TS modules under src/plugins/ exported from src/plugins/index.ts — no dynamic loading
 * (Next.js bundles statically), so "installing" a plugin is one import line. Status: IMPLEMENTED.
 */
import { registerSource, unregisterSource } from "@/aetheris/core/capabilities/registry";
import type { Capability } from "@/aetheris/core/capabilities/types";
import { record } from "@/aetheris/core/observability/events";

export interface PluginContext { uid: string; workspace?: string; signal?: AbortSignal; log: (msg: string, meta?: Record<string, unknown>) => void }
export type PluginHandler = (args: Record<string, unknown>, ctx: PluginContext) => Promise<unknown> | unknown;
export type PluginCapability = Omit<Capability, "provider" | "cost" | "latency" | "locality" | "invoke"> & Partial<Pick<Capability, "cost" | "latency" | "locality">>;
export interface PluginDef { id: string; name: string; version: string; description?: string; capabilities: PluginCapability[]; handlers: Record<string, PluginHandler> }
export interface Plugin extends PluginDef { capabilities: Capability[] }

const plugins = new Map<string, Plugin>();

export function definePlugin(def: PluginDef): Plugin {
  if (!/^[a-z][a-z0-9-]{1,40}$/.test(def.id)) throw new Error(`plugin id must be kebab-case: ${def.id}`);
  for (const c of def.capabilities) { if (!def.handlers[c.id]) throw new Error(`plugin ${def.id}: capability ${c.id} has no handler`); }
  for (const k of Object.keys(def.handlers)) { if (!def.capabilities.some((c) => c.id === k)) throw new Error(`plugin ${def.id}: handler ${k} has no capability`); }
  const caps: Capability[] = def.capabilities.map((c) => ({ cost: { unit: "free" as const }, latency: "fast" as const, locality: "local" as const, ...c, provider: `plugin:${def.id}`, tags: [...new Set([...(c.tags ?? []), "plugin", def.id])], invoke: { kind: "http", ref: `POST /api/plugins/${encodeURIComponent(c.id)}` } }));
  const p: Plugin = { ...def, capabilities: caps };
  plugins.set(def.id, p);
  registerSource({ id: `plugin:${def.id}`, list: () => caps });
  return p;
}
export function removePlugin(id: string) { plugins.delete(id); unregisterSource(`plugin:${id}`); }
export function listPlugins() { return [...plugins.values()].map((p) => ({ id: p.id, name: p.name, version: p.version, description: p.description, capabilities: p.capabilities.map((c) => c.id) })); }
export function findPluginCapability(capabilityId: string): { plugin: Plugin; capability: Capability; handler: PluginHandler } | undefined {
  for (const p of plugins.values()) { const c = p.capabilities.find((x) => x.id === capabilityId); if (c) return { plugin: p, capability: c, handler: p.handlers[capabilityId] }; }
  return undefined;
}
/** Invoke a plugin capability with observability. Permission is the caller's job (the route does it). */
export async function invokePlugin(capabilityId: string, args: Record<string, unknown>, ctx: Omit<PluginContext, "log">) {
  const hit = findPluginCapability(capabilityId); if (!hit) throw new Error(`unknown plugin capability ${capabilityId}`);
  validateArgs(hit.capability, args);
  const t0 = Date.now(); const log = (msg: string, meta?: Record<string, unknown>) => record({ type: "tool", capability: capabilityId, ok: true, ms: 0, uid: ctx.uid, meta: { log: msg, ...meta } });
  try { const result = await hit.handler(args, { ...ctx, log }); record({ type: "tool", capability: capabilityId, ok: true, ms: Date.now() - t0, uid: ctx.uid, meta: { plugin: hit.plugin.id } }); return result; }
  catch (e) { record({ type: "tool", capability: capabilityId, ok: false, ms: Date.now() - t0, uid: ctx.uid, detail: (e as Error).message, meta: { plugin: hit.plugin.id } }); throw e; }
}
/** Minimal JSON-schema check: required keys present and primitive types match (no external validator). Exported for tests. */
export function validateArgs(c: Capability, args: Record<string, unknown>) {
  const s = c.input_schema as { required?: string[]; properties?: Record<string, { type?: string }> } | undefined; if (!s) return;
  for (const k of s.required ?? []) if (args[k] === undefined) throw new Error(`missing required argument "${k}"`);
  for (const [k, v] of Object.entries(args)) { const t = s.properties?.[k]?.type; if (!t || v === undefined) continue; const actual = Array.isArray(v) ? "array" : v === null ? "null" : typeof v; if ((t === "integer" ? "number" : t) !== actual) throw new Error(`argument "${k}" should be ${t}, got ${actual}`); }
}
