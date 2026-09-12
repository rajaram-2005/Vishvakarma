/**
 * OAuth 2.1 client for remote MCP servers (MCP auth spec, 2025-06-18):
 *   protected-resource metadata → authorization-server metadata → dynamic client
 *   registration → PKCE authorization code → token.  Tokens are sealed into an httpOnly
 *   cookie keyed by connector id; nothing is stored server-side.
 */
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { seal, unseal } from "@/aetheris/lib/crypto";

export const MCP_TOKENS_COOKIE = "aetheris_mcp_tokens";
export const MCP_OAUTH_STATE_COOKIE = "aetheris_mcp_oauth";

export interface StoredToken { access_token: string; refresh_token?: string; expires_at?: number; token_endpoint?: string; client_id?: string }
export type TokenMap = Record<string, StoredToken>;

interface AsMeta {
  issuer?: string;
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint?: string;
  code_challenge_methods_supported?: string[];
  scopes_supported?: string[];
}

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store" });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

/** Discover the authorization server for an MCP resource URL. */
export async function discover(resourceUrl: string): Promise<{ as: AsMeta; resource?: string; scopes?: string[] }> {
  const u = new URL(resourceUrl);
  const origin = u.origin;
  // 1. Protected resource metadata (RFC 9728) — path-specific first, then root.
  const prPaths = [`${origin}/.well-known/oauth-protected-resource${u.pathname.replace(/\/$/, "")}`, `${origin}/.well-known/oauth-protected-resource`];
  let authServer = origin;
  let resource: string | undefined;
  let scopes: string[] | undefined;
  for (const p of prPaths) {
    const pr = await getJson<{ authorization_servers?: string[]; resource?: string; scopes_supported?: string[] }>(p);
    if (pr?.authorization_servers?.length) {
      authServer = pr.authorization_servers[0].replace(/\/$/, "");
      resource = pr.resource;
      scopes = pr.scopes_supported;
      break;
    }
  }
  // 2. Authorization server metadata (RFC 8414 / OIDC discovery).
  const asUrl = new URL(authServer);
  const candidates = [
    `${asUrl.origin}/.well-known/oauth-authorization-server${asUrl.pathname.replace(/\/$/, "")}`,
    `${asUrl.origin}/.well-known/oauth-authorization-server`,
    `${asUrl.origin}/.well-known/openid-configuration`,
    `${authServer}/.well-known/openid-configuration`,
  ];
  for (const c of candidates) {
    const m = await getJson<AsMeta>(c);
    if (m?.authorization_endpoint && m.token_endpoint) return { as: m, resource, scopes: scopes ?? m.scopes_supported };
  }
  throw new Error(`No OAuth metadata found for ${origin}. This server may need a manually issued token.`);
}

export async function registerClient(as: AsMeta, redirectUri: string): Promise<string> {
  if (!as.registration_endpoint) throw new Error("Authorization server does not support dynamic client registration");
  const r = await fetch(as.registration_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_name: "Aetheris One",
      client_uri: "https://github.com/rajaram-2005/Aetheris",
      redirect_uris: [redirectUri],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    }),
  });
  if (!r.ok) throw new Error(`Client registration failed (${r.status}): ${(await r.text()).slice(0, 200)}`);
  const j = (await r.json()) as { client_id: string };
  return j.client_id;
}

export function pkce() {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export async function exchangeCode(as: AsMeta, p: { code: string; verifier: string; clientId: string; redirectUri: string; resource?: string }): Promise<StoredToken> {
  const body = new URLSearchParams({
    grant_type: "authorization_code", code: p.code, redirect_uri: p.redirectUri, client_id: p.clientId, code_verifier: p.verifier,
    ...(p.resource ? { resource: p.resource } : {}),
  });
  const r = await fetch(as.token_endpoint, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, body });
  if (!r.ok) throw new Error(`Token exchange failed (${r.status}): ${(await r.text()).slice(0, 200)}`);
  const j = (await r.json()) as { access_token: string; refresh_token?: string; expires_in?: number };
  return { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: j.expires_in ? Date.now() + j.expires_in * 1000 : undefined, token_endpoint: as.token_endpoint, client_id: p.clientId };
}

export async function refreshToken(t: StoredToken): Promise<StoredToken | null> {
  if (!t.refresh_token || !t.token_endpoint || !t.client_id) return null;
  const body = new URLSearchParams({ grant_type: "refresh_token", refresh_token: t.refresh_token, client_id: t.client_id });
  const r = await fetch(t.token_endpoint, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, body });
  if (!r.ok) return null;
  const j = (await r.json()) as { access_token: string; refresh_token?: string; expires_in?: number };
  return { ...t, access_token: j.access_token, refresh_token: j.refresh_token ?? t.refresh_token, expires_at: j.expires_in ? Date.now() + j.expires_in * 1000 : undefined };
}

// ---- cookie storage ----------------------------------------------------------------------
export async function readTokens(): Promise<TokenMap> {
  const raw = (await cookies()).get(MCP_TOKENS_COOKIE)?.value;
  if (!raw) return {};
  try { return JSON.parse(unseal(raw) ?? "{}") as TokenMap; } catch { return {}; }
}

export function tokensCookie(map: TokenMap) {
  return { name: MCP_TOKENS_COOKIE, value: seal(JSON.stringify(map)), httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 90 };
}
