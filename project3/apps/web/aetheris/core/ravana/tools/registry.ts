/**
 * RAVANA · Unified tool protocol + registry (spec §13).
 *
 * Every tool is described by one descriptor {name, description, schema, permissions, timeout,
 * sandbox, execution policy} and implemented by one runtime. The engine never calls a tool
 * directly: it goes through the permission layer (Capability & Permission Manager, spec §14).
 */
import type { RavanaTool } from "../types";
import { searchKeyFor } from "@/aetheris/lib/search/tavily";

export interface ToolArgs {
  [k: string]: unknown;
}

export interface ToolResult {
  ok: boolean;
  /** short human line for the trace event */
  summary: string;
  output?: string;
  data?: unknown;
  error?: string;
  /** files produced/seen (artifacts) */
  files?: Record<string, string>;
  ms: number;
}

export interface ToolRuntimeContext {
  uid: string;
  taskId: string;
  projectId?: string | null;
  signal?: AbortSignal;
}

export interface RavanaToolRuntime extends RavanaTool {
  run(ctx: ToolRuntimeContext, args: ToolArgs): Promise<ToolResult>;
}

export const registry = new Map<string, RavanaToolRuntime>();

export function registerTool(t: RavanaToolRuntime): void {
  registry.set(t.name, t);
}

export function tool(name: string): RavanaToolRuntime | undefined {
  return registry.get(name);
}

export function toolStatus(): RavanaTool[] {
  return [...registry.values()]
    .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name))
    .map(({ run: _run, ...desc }) => {
      // Key-backed tools re-check their key on every read, so the status list is never stale
      // after a key is added or removed from Settings (no restart needed either way).
      if (desc.name === "web.search") {
        const has = !!searchKeyFor();
        return { ...desc, status: has ? "implemented" : "not_configured", note: has ? undefined : "no Tavily key — add one in Settings → API keys, or set TAVILY_API_KEY" };
      }
      return desc;
    });
}

/** Tool→capability id for the permission layer. */
export function toolCapabilityId(name: string): string {
  return `ravana:tool:${name}`;
}

/** Alias resolution used by plan tool lists ("python" → "python.execute", "research" → "web.search"). */
const ALIASES: Record<string, string> = {
  python: "python.execute",
  shell: "shell.execute",
  terminal: "shell.execute",
  filesystem: "filesystem.read",
  research: "web.search",
  search: "web.search",
  memory: "memory.search",
};

export function resolveToolName(name: string): string {
  return ALIASES[name] ?? name;
}

export function availableForPlan(tools: string[]): string[] {
  return [...new Set(tools.map(resolveToolName).filter((t) => registry.has(t)))];
}
