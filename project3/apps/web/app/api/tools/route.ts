import { NextResponse } from "next/server";
import { bootCapabilities } from "@/aetheris/core/capabilities/sources";
import { searchCapabilities } from "@/aetheris/core/capabilities/registry";
import type { CapabilityStatus, SecurityLevel } from "@/aetheris/core/capabilities/types";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";

/**
 * GET /api/tools?q=&status=&maxSecurity=&limit= — the callable-tool view of the Capability Registry
 * (categories tool + connector + execution + user MCP servers). Each entry says how to invoke it:
 *   hub tools        → POST /api/mcp/hub  JSON-RPC {method:"tools/call", params:{name:"<connector>__<tool>", arguments}}
 *   user MCP servers → POST /api/mcp/servers/:id/call {tool, args, confirmationToken?}
 *   sandbox          → POST /api/executions
 */
export async function GET(req: Request) {
  bootCapabilities(); const u = new URL(req.url); const list = (k: string) => u.searchParams.get(k)?.split(",").filter(Boolean);
  const items = await searchCapabilities({ q: u.searchParams.get("q") ?? undefined, category: ["tool", "connector", "execution"], status: list("status") as CapabilityStatus[] | undefined, maxSecurity: (u.searchParams.get("maxSecurity") as SecurityLevel) || undefined, limit: Number(u.searchParams.get("limit") ?? 100) });
  const tools = items.map((c) => ({ id: c.id, name: c.name, category: c.category, status: c.status, security_level: c.security_level, requires_confirmation: c.requires_confirmation ?? false, provider: c.provider, input_schema: c.input_schema, invoke: c.id.startsWith("mcpserver:") ? { method: "POST", path: `/api/mcp/servers/${c.id.slice(10).split(".")[0]}/call`, body: { tool: c.id.split(".").slice(1).join("."), args: {} } } : c.category === "execution" ? { method: "POST", path: "/api/executions" } : { method: "POST", path: "/api/mcp/hub", body: { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: c.id.replace(/^tool:/, "").replace(".", "__"), arguments: {} } } } }));
  return NextResponse.json({ count: tools.length, tools });
}
