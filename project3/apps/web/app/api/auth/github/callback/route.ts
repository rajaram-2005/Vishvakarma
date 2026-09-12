import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { STATE_COOKIE, requestOrigin, sessionCookie } from "@/aetheris/lib/github/auth";
import { viewer } from "@/aetheris/lib/github/api";
import { getSessionAccount, mergeAnonymous, resolveAccount, sessionCookies } from "@/aetheris/lib/auth/accounts";
import { getUserId } from "@/aetheris/lib/user";
import { AUTH_RETURN_COOKIE, safeReturnTo } from "@/aetheris/lib/auth/return-to";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const jar = await cookies();
  const expected = jar.get(STATE_COOKIE)?.value;
  const origin = requestOrigin(req);
  const next = safeReturnTo(jar.get(AUTH_RETURN_COOKIE)?.value);

  if (!code || !state || !expected || state !== expected) {
    return NextResponse.redirect(`${origin}/?error=${encodeURIComponent("Sign-in state mismatch. Please try again.")}&next=${encodeURIComponent(next)}`);
  }

  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: `${requestOrigin(req)}/api/auth/github/callback`,
    }),
  });
  const tok = (await tokenRes.json()) as { access_token?: string; error?: string };
  if (!tok.access_token) {
    return NextResponse.redirect(`${origin}/?error=${encodeURIComponent(tok.error ?? "GitHub token exchange failed")}&next=${encodeURIComponent(next)}`);
  }

  const me = await viewer(tok.access_token);
  // Primary verified email (for identity linking with Google / email sign-in).
  let email: string | undefined;
  try {
    const emails = await fetch("https://api.github.com/user/emails", { headers: { Authorization: `Bearer ${tok.access_token}`, Accept: "application/vnd.github+json" } }).then((r) => r.json()) as { email: string; primary: boolean; verified: boolean }[];
    email = emails.find((e) => e.primary && e.verified)?.email ?? emails.find((e) => e.verified)?.email;
  } catch { /* scope may be missing */ }
  const { uid } = await getUserId({ allowAnonymous: true, freshAnonymous: true });
  const current = await getSessionAccount();
  const acc = await resolveAccount({ provider: "github", subject: me.login, email, name: me.login, avatar: me.avatar_url }, uid, current?.id);
  await mergeAnonymous(uid, acc);
  const destination = new URL(next, origin);
  destination.searchParams.set("auth", "ok");
  const res = NextResponse.redirect(destination);
  res.cookies.set(sessionCookie({ token: tok.access_token, login: me.login, avatar: me.avatar_url, via: "oauth" }));
  for (const c of sessionCookies(acc)) res.cookies.set(c);
  res.cookies.delete(STATE_COOKIE);
  res.cookies.delete(AUTH_RETURN_COOKIE);
  return res;
}
