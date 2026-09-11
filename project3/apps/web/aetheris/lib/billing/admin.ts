import { timingSafeEqual } from "node:crypto";
import { getSessionAccount, type Account } from "@/aetheris/lib/auth/accounts";

/** Admin identities: emails / phones (comma-separated env, defaults to the founder). */
export const ADMIN_EMAILS = (process.env.AETHERIS_ADMIN_EMAILS ?? "ramkpraja175@gmail.com").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
export const ADMIN_PHONES = (process.env.AETHERIS_ADMIN_PHONES ?? "+919488407998").split(",").map((s) => "+" + s.replace(/\D/g, "")).filter((s) => s.length > 5);

export function isAdminAccount(acc: Account | null | undefined): boolean {
  if (!acc) return false;
  return (!!acc.email && ADMIN_EMAILS.includes(acc.email)) || (!!acc.phone && ADMIN_PHONES.includes(acc.phone));
}

const adminUidCache = new Map<string, { v: boolean; at: number }>();
/** Is this uid owned by an admin account? (cached 30s; used by entitlements so admins bypass all limits). */
export async function isAdminUid(uid: string): Promise<boolean> {
  const c = adminUidCache.get(uid);
  if (c && Date.now() - c.at < 30_000) return c.v;
  const { store } = await import("@/aetheris/lib/store");
  const accs = await store.all<Account>("accounts");
  const v = Object.values(accs).some((a) => a.uid === uid && isAdminAccount(a));
  adminUidCache.set(uid, { v, at: Date.now() });
  return v;
}
export function markAdminUid(uid: string, v: boolean) { adminUidCache.set(uid, { v, at: Date.now() }); }

function keyMatches(req: Request): boolean {
  const expected = process.env.AETHERIS_ADMIN_KEY;
  if (!expected) return false;
  const h = req.headers.get("authorization") ?? "";
  const given = h.startsWith("Bearer ") ? h.slice(7) : new URL(req.url).searchParams.get("key") ?? "";
  if (given.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

/** Admin auth: signed-in admin account, or Bearer/?key= matching AETHERIS_ADMIN_KEY. */
export async function isAdmin(req: Request): Promise<boolean> {
  if (keyMatches(req)) return true;
  try { return isAdminAccount(await getSessionAccount()); } catch { return false; }
}
