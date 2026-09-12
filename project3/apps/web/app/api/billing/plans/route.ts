import { NextResponse } from "next/server";
import { getUserId, uidCookie } from "@/aetheris/lib/user";
import { usageSummary } from "@/aetheris/lib/billing/entitlements";
import { freeForAll, PAYEE } from "@/aetheris/lib/billing/plans";
import { getSessionAccount, publicAccount } from "@/aetheris/lib/auth/accounts";
import { isAdminAccount, markAdminUid } from "@/aetheris/lib/billing/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const { uid, isNew } = await getUserId();
  const acc = await getSessionAccount();
  const admin = isAdminAccount(acc);
  if (admin) markAdminUid(uid, true);
  const res = NextResponse.json({ ...(await usageSummary(uid)), user: acc ? { ...publicAccount(acc), admin } : null, admin, freeForAll: freeForAll(), payee: { phone: PAYEE.phone, email: PAYEE.email } });
  if (isNew) res.cookies.set(uidCookie(uid));
  return res;
}
