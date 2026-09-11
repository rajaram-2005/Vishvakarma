import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { STATE_COOKIE, oauthConfigured, requestOrigin } from "@/aetheris/lib/github/auth";
import { authReturnCookie, safeReturnTo } from "@/aetheris/lib/auth/return-to";

export const dynamic = "force-dynamic";

/** Start the GitHub OAuth flow. */
export async function GET(req: Request) {
  if (!oauthConfigured()) {
    return NextResponse.json({ error: "GitHub OAuth not configured (GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET)." }, { status: 503 });
  }
  const state = randomBytes(16).toString("hex");
  const next = safeReturnTo(new URL(req.url).searchParams.get("next"));
  const redirect = `${requestOrigin(req)}/api/auth/github/callback`;
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", process.env.GITHUB_CLIENT_ID!);
  url.searchParams.set("redirect_uri", redirect);
  url.searchParams.set("scope", "repo workflow read:user user:email");
  url.searchParams.set("state", state);
  const res = NextResponse.redirect(url);
  res.cookies.set(STATE_COOKIE, state, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 600 });
  res.cookies.set(authReturnCookie(next));
  return res;
}
