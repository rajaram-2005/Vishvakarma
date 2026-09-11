import { NextResponse } from "next/server";
import { sessionCookie } from "@/aetheris/lib/github/auth";
import { GitHubError, viewer } from "@/aetheris/lib/github/api";

export const dynamic = "force-dynamic";

/** Fallback: sign in with a personal access token (repo + workflow scopes). */
export async function POST(req: Request) {
  let token: string | undefined;
  try {
    token = ((await req.json()) as { token?: string }).token?.trim();
  } catch { /* ignore */ }
  if (!token) return NextResponse.json({ error: "token required" }, { status: 400 });
  try {
    const me = await viewer(token);
    const res = NextResponse.json({ login: me.login, avatar: me.avatar_url, via: "pat" });
    res.cookies.set(sessionCookie({ token, login: me.login, avatar: me.avatar_url, via: "pat" }));
    return res;
  } catch (e) {
    const status = e instanceof GitHubError ? e.status : 500;
    return NextResponse.json({ error: "GitHub rejected that token" }, { status: status === 401 ? 401 : 502 });
  }
}
