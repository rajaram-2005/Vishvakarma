import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { connectorById } from "@/aetheris/lib/mcp/catalog";
import { discover, pkce, registerClient, MCP_OAUTH_STATE_COOKIE } from "@/aetheris/lib/mcp/oauth";
import { requestOrigin } from "@/aetheris/lib/github/auth";
import { seal } from "@/aetheris/lib/crypto";

export const dynamic = "force-dynamic";

/** GET /api/mcp/oauth/start?id=<connector>[&url=<custom mcp url>] */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const id = sp.get("id");
  const c = id ? connectorById(id) : undefined;
  const url = c?.url ?? sp.get("url");
  if (!id || !url) return NextResponse.json({ error: "id (and url for custom servers) required" }, { status: 400 });
  const home = `${requestOrigin(req)}/`;
  try {
    const redirectUri = `${requestOrigin(req)}/api/mcp/oauth/callback`;
    const { as, resource, scopes } = await discover(url);
    const clientId = c?.oauthClientId ?? (await registerClient(as, redirectUri));
    const { verifier, challenge } = pkce();
    const state = randomBytes(16).toString("hex");
    const auth = new URL(as.authorization_endpoint);
    auth.searchParams.set("response_type", "code");
    auth.searchParams.set("client_id", clientId);
    auth.searchParams.set("redirect_uri", redirectUri);
    auth.searchParams.set("code_challenge", challenge);
    auth.searchParams.set("code_challenge_method", "S256");
    auth.searchParams.set("state", state);
    if (resource) auth.searchParams.set("resource", resource);
    if (scopes?.length) auth.searchParams.set("scope", scopes.join(" "));
    const res = NextResponse.redirect(auth);
    res.cookies.set(MCP_OAUTH_STATE_COOKIE, seal(JSON.stringify({ id, state, verifier, clientId, redirectUri, resource, as })), { httpOnly: true, sameSite: "lax", path: "/", maxAge: 600 });
    return res;
  } catch (e) {
    return NextResponse.redirect(`${home}?mcp=error&id=${encodeURIComponent(id)}&reason=${encodeURIComponent((e as Error).message)}`);
  }
}
