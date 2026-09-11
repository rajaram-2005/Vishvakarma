import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { unseal } from "@/aetheris/lib/crypto";
import { requestOrigin } from "@/aetheris/lib/github/auth";
import { MCP_OAUTH_STATE_COOKIE, exchangeCode, readTokens, tokensCookie } from "@/aetheris/lib/mcp/oauth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const home = `${requestOrigin(req)}/`;
  const raw = (await cookies()).get(MCP_OAUTH_STATE_COOKIE)?.value;
  const st = raw ? JSON.parse(unseal(raw) ?? "null") : null;
  if (!st || sp.get("state") !== st.state || !sp.get("code")) {
    return NextResponse.redirect(`${home}?mcp=error&reason=state`);
  }
  try {
    const token = await exchangeCode(st.as, { code: sp.get("code")!, verifier: st.verifier, clientId: st.clientId, redirectUri: st.redirectUri, resource: st.resource });
    const map = await readTokens();
    map[st.id] = token;
    const res = NextResponse.redirect(`${home}?mcp=ok&id=${encodeURIComponent(st.id)}`);
    res.cookies.set(tokensCookie(map));
    res.cookies.delete(MCP_OAUTH_STATE_COOKIE);
    return res;
  } catch (e) {
    return NextResponse.redirect(`${home}?mcp=error&id=${encodeURIComponent(st.id)}&reason=${encodeURIComponent((e as Error).message)}`);
  }
}
