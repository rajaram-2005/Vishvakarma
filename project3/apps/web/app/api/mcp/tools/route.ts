import { NextResponse } from "next/server";
import { bindServers, type EnabledServer } from "@/aetheris/lib/mcp/agent";
import { readTokens } from "@/aetheris/lib/mcp/oauth";

export const dynamic = "force-dynamic";

/** Test a server connection and list its tools. */
export async function POST(req: Request) {
  const s = (await req.json().catch(() => null)) as EnabledServer | null;
  if (!s?.id) return NextResponse.json({ error: "server id required" }, { status: 400 });
  const tokens = await readTokens();
  const oauthTokens = Object.fromEntries(Object.entries(tokens).map(([k, v]) => [k, v.access_token]));
  const { bound, failures } = await bindServers([s], { oauthTokens });
  if (bound.length === 0) {
    const err = failures[0]?.error ?? "connection failed";
    const needsOauth = /401|403|Unauthorized|invalid_token/i.test(err);
    return NextResponse.json({ error: err, needsOauth }, { status: 502 });
  }
  return NextResponse.json({ server: s.id, tools: bound[0].tools.map((t) => ({ name: t.name, description: t.description })) });
}
