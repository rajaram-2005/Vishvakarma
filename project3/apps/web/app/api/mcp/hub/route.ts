/**
 * Aetheris MCP Hub — ONE Streamable-HTTP MCP server exposing every connector.
 *
 *   POST /api/mcp/hub            JSON-RPC (initialize / tools/list / tools/call)
 *   GET  /api/mcp/hub            human/agent-readable summary
 *
 * Auth (any of):
 *   - browser session cookie (aetheris_uid + OAuth tokens cookie)          → in-app use
 *   - Authorization: Bearer sk-aeth-…  (personal Aetheris API key, Lite+)   → Claude Desktop, Cursor, any MCP client
 * Per-connector credentials: stored via POST /api/mcp/hub/credentials, or per request as
 *   X-Aetheris-Cred-<connectorId>: <credential>
 * Optional: X-Aetheris-Connectors: github,slack   (restrict this session to a subset)
 */
import { NextResponse } from "next/server";
import { getUserId } from "@/aetheris/lib/user";
import { authenticateKey } from "@/aetheris/lib/keys/apikeys";
import { readTokens } from "@/aetheris/lib/mcp/oauth";
import { getSession } from "@/aetheris/lib/github/auth";
import { getStoredCreds, handleHubRpc, hubSummary, type HubContext } from "@/aetheris/lib/mcp/hub";
import { hasFeature } from "@/aetheris/lib/billing/entitlements";
import { connectorById } from "@/aetheris/lib/mcp/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function buildContext(req: Request): Promise<{ ctx: HubContext } | { error: string; status: number }> {
  const auth = req.headers.get("authorization") ?? "";
  let uid: string | null = null;
  let viaKey = false;
  if (auth.startsWith("Bearer sk-aeth-")) {
    const k = await authenticateKey(auth.slice(7).trim());
    if (!k) return { error: "invalid API key", status: 401 };
    uid = k.uid; viaKey = true;
  } else {
    const u = await getUserId();
    if (u.isNew) return { error: "no session — sign in to Aetheris or use an API key", status: 401 };
    uid = u.uid;
  }
  const creds = await getStoredCreds(uid);
  for (const [h, v] of req.headers.entries()) {
    if (h.startsWith("x-aetheris-cred-") && v) creds[h.slice("x-aetheris-cred-".length)] = v;
  }
  const only = req.headers.get("x-aetheris-connectors")?.split(",").map((s) => s.trim()).filter(Boolean);
  // OAuth tokens + GitHub session only exist for browser sessions (cookies).
  const oauthTokens: Record<string, string> = {};
  let github: HubContext["github"];
  if (!viaKey) {
    for (const [id, t] of Object.entries(await readTokens().catch(() => ({})))) oauthTokens[id] = t.access_token;
    const gh = await getSession().catch(() => null);
    if (gh) github = { token: gh.token, login: gh.login };
  }
  return { ctx: { uid, creds, oauthTokens, github, only: only?.length ? only : undefined } };
}

export async function GET(req: Request) {
  const b = await buildContext(req);
  const sum = hubSummary();
  if ("error" in b) return NextResponse.json({ name: "aetheris-hub", transport: "streamable-http", ...sum, note: "authenticate with an Aetheris API key or session to list/call tools" });
  const ready = Object.keys(b.ctx.creds).concat(Object.keys(b.ctx.oauthTokens ?? {}));
  return NextResponse.json({ name: "aetheris-hub", transport: "streamable-http", ...sum, ready: [...new Set(ready)], usage: "POST JSON-RPC here; tools are <connector>__<tool>; start with hub__search_tools" });
}

export async function POST(req: Request) {
  const b = await buildContext(req);
  if ("error" in b) return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32001, message: b.error } }, { status: b.status });
  let msg; try { msg = await req.json(); } catch { return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } }, { status: 400 }); }
  // Premium connectors need a plan with mcp_premium.
  if (msg?.method === "tools/call") {
    const cid = String(msg.params?.name ?? "").split("__")[0];
    if (connectorById(cid)?.premium && !(await hasFeature(b.ctx.uid, "mcp_premium"))) {
      return NextResponse.json({ jsonrpc: "2.0", id: msg.id, result: { content: [{ type: "text", text: `${cid} is a premium connector — needs Aetheris Pro or above.` }], isError: true } });
    }
  }
  const out = await handleHubRpc(b.ctx, msg, req.signal);
  if (out === null) return new Response(null, { status: 202 });
  return NextResponse.json(out);
}
