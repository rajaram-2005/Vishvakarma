import { NextResponse } from "next/server";
import { apiById } from "@/aetheris/lib/gateway/apis";
import { handleRpc } from "@/aetheris/lib/gateway/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * MCP Streamable-HTTP endpoint for a gateway connector: POST /api/gateway/<id>
 * Credential: Authorization: Bearer <token>  (or X-Aetheris-Credential for non-bearer upstreams)
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const api = apiById(id);
  if (!api) return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32601, message: `unknown gateway connector ${id}` } }, { status: 404 });
  const auth = req.headers.get("authorization") ?? "";
  const credential = req.headers.get("x-aetheris-credential") ?? (auth.startsWith("Bearer ") ? auth.slice(7) : undefined);
  let msg;
  try { msg = await req.json(); } catch { return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } }, { status: 400 }); }
  const out = await handleRpc(api, msg, credential, req.signal);
  if (out === null) return new Response(null, { status: 202 });
  return NextResponse.json(out);
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const api = apiById(id);
  if (!api) return NextResponse.json({ error: "unknown connector" }, { status: 404 });
  return NextResponse.json({ id: api.id, name: api.name, transport: "streamable-http", tools: api.tools.map((t) => t.name) });
}
