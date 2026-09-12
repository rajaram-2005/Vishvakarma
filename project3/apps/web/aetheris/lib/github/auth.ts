import { cookies } from "next/headers";
import { seal, unseal } from "@/aetheris/lib/crypto";

export const SESSION_COOKIE = "aetheris_gh";
export const STATE_COOKIE = "aetheris_gh_state";

export interface GitHubSession {
  token: string;
  login: string;
  avatar?: string;
  /** "oauth" | "pat" */
  via: "oauth" | "pat";
}

export function oauthConfigured(): boolean {
  return Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET);
}

export async function getSession(): Promise<GitHubSession | null> {
  const jar = await cookies();
  const raw = jar.get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  const json = unseal(raw);
  if (!json) return null;
  try {
    return JSON.parse(json) as GitHubSession;
  } catch {
    return null;
  }
}

export function sessionCookie(session: GitHubSession) {
  return {
    name: SESSION_COOKIE,
    value: seal(JSON.stringify(session)),
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  };
}

/** Resolve the public origin of this deployment (works behind the preview proxy). */
export function requestOrigin(req: Request): string {
  const url = new URL(req.url);
  const proto = req.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? url.host;
  return `${proto}://${host}`;
}
