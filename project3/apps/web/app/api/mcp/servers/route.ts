import { NextResponse } from "next/server";
import { getUserId, uidCookie } from "@/aetheris/lib/user";
import { gatewaySummary, listServers, registerServer } from "@/aetheris/core/mcp/gateway";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";

/** GET → my registered MCP servers (manifest, health, versions). POST {name?, url, headers?} → register + probe. */
export async function GET() { const { uid, isNew } = await getUserId(); const res = NextResponse.json({ servers: await listServers(uid), summary: await gatewaySummary() }); if (isNew) res.cookies.set(uidCookie(uid)); return res; }
export async function POST(req: Request) {
  const { uid, isNew } = await getUserId();
  const b = (await req.json().catch(() => ({}))) as { name?: string; url?: string; headers?: Record<string, string> };
  if (!b.url) return NextResponse.json({ error: "url required" }, { status: 400 });
  try { const s = await registerServer(uid, { name: b.name, url: b.url, headers: b.headers }); const res = NextResponse.json({ server: s }, { status: s.health.state === "healthy" ? 201 : 202 }); if (isNew) res.cookies.set(uidCookie(uid)); return res; }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}
