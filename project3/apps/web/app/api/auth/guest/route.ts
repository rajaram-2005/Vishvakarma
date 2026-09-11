import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { getSessionAccount, mergeAnonymous, publicAccount, resolveAccount, sessionCookies } from "@/aetheris/lib/auth/accounts";
import { guestAccessEnabled } from "@/aetheris/lib/auth/gate";
import { safeReturnTo } from "@/aetheris/lib/auth/return-to";
import { requestOrigin } from "@/aetheris/lib/github/auth";
import { getUserId } from "@/aetheris/lib/user";
import { rateLimit } from "@/aetheris/core/security/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type GuestBody = { name?: unknown; next?: unknown };

function wantsHtml(req: Request): boolean {
  const accept = req.headers.get("accept") ?? "";
  return accept.includes("text/html") && !accept.includes("application/json");
}

function redirectAfterGuest(req: Request, next: string, error?: string) {
  const destination = new URL(error ? "/" : safeReturnTo(next), `${requestOrigin(req)}/`);
  if (error) {
    destination.searchParams.set("error", error);
    destination.searchParams.set("next", safeReturnTo(next));
  }
  return NextResponse.redirect(destination, 303);
}

async function readBody(req: Request): Promise<GuestBody> {
  const type = req.headers.get("content-type") ?? "";
  if (type.includes("application/x-www-form-urlencoded") || type.includes("multipart/form-data")) {
    const form = await req.formData().catch(() => null);
    return { name: form?.get("name"), next: form?.get("next") };
  }
  return (await req.json().catch(() => ({}))) as GuestBody;
}

/** Create a browser-local guest account from a display name—no verified cross-device identity. */
export async function POST(req: Request) {
  const html = wantsHtml(req);
  const body = await readBody(req);
  const next = typeof body.next === "string" ? safeReturnTo(body.next) : "/";
  const fail = (message: string, status: number) => html
    ? redirectAfterGuest(req, next, message)
    : NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });

  if (!guestAccessEnabled()) return fail("Guest access is disabled.", 404);
  const current = await getSessionAccount();
  if (current) {
    if (html) {
      const res = redirectAfterGuest(req, next);
      for (const cookie of sessionCookies(current)) res.cookies.set(cookie);
      return res;
    }
    return NextResponse.json({ account: publicAccount(current) });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "local";
  const limit = rateLimit(`auth:guest:${ip}`, { limit: 10, windowMs: 60 * 60_000 });
  if (!limit.ok) return fail("Too many guest sessions. Try again later.", 429);

  const name = typeof body.name === "string" ? body.name.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim() : "";
  if (name.length < 2 || name.length > 50) {
    return fail("Enter a name between 2 and 50 characters.", 400);
  }

  const { uid } = await getUserId({ allowAnonymous: true, freshAnonymous: true });
  const subject = randomBytes(16).toString("hex");
  const account = await resolveAccount({ provider: "guest", subject, name }, uid);
  await mergeAnonymous(uid, account);

  const res = html
    ? redirectAfterGuest(req, next)
    : NextResponse.json({ account: publicAccount(account), guest: true }, { status: 201 });
  for (const cookie of sessionCookies(account)) res.cookies.set(cookie);
  return res;
}
