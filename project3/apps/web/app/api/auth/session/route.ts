import { NextResponse } from "next/server";
import { SESSION_COOKIE, getSessionAccount, publicAccount } from "@/aetheris/lib/auth/accounts";
import { googleConfigured } from "@/aetheris/lib/auth/deliver";
import { oauthConfigured as githubConfigured } from "@/aetheris/lib/github/auth";
import { usageSummary } from "@/aetheris/lib/billing/entitlements";
import { getUserId } from "@/aetheris/lib/user";
import { isAdminAccount, markAdminUid } from "@/aetheris/lib/billing/admin";
import { authenticationRequired, guestAccessEnabled } from "@/aetheris/lib/auth/gate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET → who am I + which sign-in methods this deployment supports. */
export async function GET() {
  const acc = await getSessionAccount();
  const { uid } = await getUserId({ allowAnonymous: true });
  const admin = isAdminAccount(acc);
  if (admin) markAdminUid(uid, true);
  const usage = await usageSummary(uid);
  return NextResponse.json({
    account: acc ? { ...publicAccount(acc), admin, guest: acc.providers.guest !== undefined } : null,
    admin,
    plan: usage.planId,
    authRequired: authenticationRequired(),
    methods: {
      google: googleConfigured(),
      github: githubConfigured(),
      guest: guestAccessEnabled(),
    },
  });
}

/** DELETE → sign out (keeps the uid cookie so anonymous usage continues under the same id). */
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  res.cookies.delete("aetheris_gh");
  return res;
}
