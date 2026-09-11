import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { requestOrigin } from "@/aetheris/lib/github/auth";
import { googleConfigured } from "@/aetheris/lib/auth/deliver";
import { authReturnCookie, safeReturnTo } from "@/aetheris/lib/auth/return-to";

export const dynamic = "force-dynamic";
const GOOGLE_STATE = "aetheris_g_state";

export async function GET(req: Request) {
  if (!googleConfigured()) return NextResponse.redirect(`${requestOrigin(req)}/?error=${encodeURIComponent("Google sign-in is not configured (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET).")}`);
  const state = randomBytes(16).toString("hex");
  const next = safeReturnTo(new URL(req.url).searchParams.get("next"));
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID!);
  url.searchParams.set("redirect_uri", `${requestOrigin(req)}/api/auth/google/callback`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "select_account");
  const res = NextResponse.redirect(url);
  res.cookies.set(GOOGLE_STATE, state, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 600 });
  res.cookies.set(authReturnCookie(next));
  return res;
}
