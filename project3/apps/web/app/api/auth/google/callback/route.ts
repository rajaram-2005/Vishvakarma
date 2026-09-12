import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requestOrigin } from "@/aetheris/lib/github/auth";
import { getSessionAccount, mergeAnonymous, resolveAccount, sessionCookies } from "@/aetheris/lib/auth/accounts";
import { getUserId } from "@/aetheris/lib/user";
import { AUTH_RETURN_COOKIE, safeReturnTo } from "@/aetheris/lib/auth/return-to";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const GOOGLE_STATE = "aetheris_g_state";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = requestOrigin(req);
  const code = url.searchParams.get("code"); const state = url.searchParams.get("state");
  const jar = await cookies();
  const expected = jar.get(GOOGLE_STATE)?.value;
  const next = safeReturnTo(jar.get(AUTH_RETURN_COOKIE)?.value);
  const fail = (reason: string) => NextResponse.redirect(`${origin}/?error=${encodeURIComponent(reason)}&next=${encodeURIComponent(next)}`);
  if (!code || !state || state !== expected) return fail("Sign-in state mismatch. Please try again.");
  const tok = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, redirect_uri: `${origin}/api/auth/google/callback`, grant_type: "authorization_code" }),
  }).then((r) => r.json()) as { access_token?: string; id_token?: string; error?: string };
  if (!tok.access_token) return fail(tok.error ?? "Google token exchange failed");
  const me = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${tok.access_token}` } }).then((r) => r.json()) as { sub: string; email?: string; email_verified?: boolean; name?: string; picture?: string };
  if (!me.sub) return fail("Could not read Google profile");
  const { uid } = await getUserId({ allowAnonymous: true, freshAnonymous: true });
  const current = await getSessionAccount();
  const acc = await resolveAccount({ provider: "google", subject: me.sub, email: me.email_verified ? me.email : undefined, name: me.name, avatar: me.picture }, uid, current?.id);
  await mergeAnonymous(uid, acc);
  const destination = new URL(next, origin);
  destination.searchParams.set("auth", "ok");
  const res = NextResponse.redirect(destination);
  for (const c of sessionCookies(acc)) res.cookies.set(c);
  res.cookies.delete(GOOGLE_STATE);
  res.cookies.delete(AUTH_RETURN_COOKIE);
  return res;
}
