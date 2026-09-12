/**
 * Accounts + sessions. An Account owns a `uid` — the same id used by billing, usage, API keys,
 * lessons and hub credentials — so signing in on any device restores everything.
 *
 * Identity linking: the same verified email (Google / GitHub / email OTP) always resolves to one
 * account; a phone number resolves to one account; providers can be linked onto an existing
 * account when the user is already signed in.
 */
import { randomBytes, randomInt, createHash } from "node:crypto";
import { cookies } from "next/headers";
import { store } from "@/aetheris/lib/store";
import { seal, unseal } from "@/aetheris/lib/crypto";
import { UID_COOKIE } from "@/aetheris/lib/user";
import { ACCOUNT_SESSION_COOKIE } from "@/aetheris/lib/auth/constants";

export type Provider = "google" | "github" | "email" | "phone" | "guest";

export interface Account {
  id: string;
  uid: string;
  name?: string;
  avatar?: string;
  email?: string;            // lowercased, verified
  phone?: string;            // E.164
  providers: Partial<Record<Provider, string>>; // provider → subject (google sub, github login, email, phone)
  createdAt: number;
  lastLoginAt: number;
}

export const SESSION_COOKIE = ACCOUNT_SESSION_COOKIE;
const ACC = "accounts";
const IDX = "account_index"; // key "email:x" | "phone:x" | "google:sub" | "github:login" → accountId

const norm = { email: (e: string) => e.trim().toLowerCase(), phone: (p: string) => { const d = p.replace(/\D/g, ""); return "+" + (d.length === 10 && !p.trim().startsWith("+") ? "91" + d : d); } };
export const normalizeEmail = norm.email;
export const normalizePhone = norm.phone;

async function idx(key: string): Promise<string | undefined> { return (await store.get<{ id: string }>(IDX, key))?.id; }
async function setIdx(key: string, id: string) { await store.set(IDX, key, { id }); }

export async function getAccount(id: string): Promise<Account | null> { return (await store.get<Account>(ACC, id)) ?? null; }

export interface Identity { provider: Provider; subject: string; email?: string; phone?: string; name?: string; avatar?: string }

/**
 * Find-or-create the account for a verified identity. `anonUid` is the visitor's current
 * anonymous uid: a brand-new account adopts it so nothing the visitor already did is lost.
 * `linkTo` links the identity onto an already signed-in account instead.
 */
export async function resolveAccount(idn: Identity, anonUid: string, linkTo?: string | null): Promise<Account> {
  const email = idn.email ? norm.email(idn.email) : undefined;
  const phone = idn.phone ? norm.phone(idn.phone) : undefined;
  const keys = [`${idn.provider}:${idn.subject}`, ...(email ? [`email:${email}`] : []), ...(phone ? [`phone:${phone}`] : [])];
  let id = linkTo ?? undefined;
  if (!id) for (const k of keys) { id = await idx(k); if (id) break; }

  let acc: Account;
  if (id && (acc = (await getAccount(id))!)) {
    acc = { ...acc, lastLoginAt: Date.now(), name: acc.name ?? idn.name, avatar: acc.avatar ?? idn.avatar, email: acc.email ?? email, phone: acc.phone ?? phone, providers: { ...acc.providers, [idn.provider]: idn.subject } };
  } else {
    acc = { id: randomBytes(12).toString("hex"), uid: anonUid, name: idn.name, avatar: idn.avatar, email, phone, providers: { [idn.provider]: idn.subject }, createdAt: Date.now(), lastLoginAt: Date.now() };
  }
  await store.set(ACC, acc.id, acc);
  for (const k of keys) await setIdx(k, acc.id);
  if (acc.email) await setIdx(`email:${acc.email}`, acc.id);
  if (acc.phone) await setIdx(`phone:${acc.phone}`, acc.id);
  return acc;
}

/** Move an anonymous visitor's paid entitlement onto the account uid if the account has none. */
export async function mergeAnonymous(anonUid: string, acc: Account) {
  if (anonUid === acc.uid) return;
  const { getEntitlement } = await import("@/aetheris/lib/billing/entitlements");
  const anonEnt = await getEntitlement(anonUid);
  const accEnt = await getEntitlement(acc.uid);
  if (anonEnt && !accEnt) await store.set("entitlements", acc.uid, { ...anonEnt, uid: acc.uid });
}

// ---- session cookie -----------------------------------------------------------------------------
export async function getSessionAccount(): Promise<Account | null> {
  const raw = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  const json = unseal(raw);
  if (!json) return null;
  try { const { id, exp } = JSON.parse(json) as { id: string; exp: number }; if (exp < Date.now()) return null; return getAccount(id); } catch { return null; }
}

const secure = process.env.NODE_ENV === "production";
/** Cookies to set after sign-in: the sealed session AND the uid (so all uid-keyed data follows). */
export function sessionCookies(acc: Account) {
  const exp = Date.now() + 90 * 86_400_000;
  return [
    { name: SESSION_COOKIE, value: seal(JSON.stringify({ id: acc.id, uid: acc.uid, exp })), httpOnly: true, sameSite: "lax" as const, secure, path: "/", maxAge: 90 * 86400 },
    { name: UID_COOKIE, value: acc.uid, httpOnly: true, sameSite: "lax" as const, secure, path: "/", maxAge: 365 * 86400 },
  ];
}

// ---- one-time codes (email / phone) -------------------------------------------------------------
interface Otp { hash: string; exp: number; tries: number; sentAt: number }
const OTP = "otp";
const hash = (s: string) => createHash("sha256").update(s).digest("hex");

export async function issueCode(channel: "email" | "phone", target: string): Promise<{ code: string } | { error: string }> {
  const key = `${channel}:${target}`;
  const cur = await store.get<Otp>(OTP, key);
  if (cur && Date.now() - cur.sentAt < 45_000) return { error: "Please wait a moment before requesting another code." };
  const code = String(randomInt(100000, 1_000_000));
  await store.set<Otp>(OTP, key, { hash: hash(code), exp: Date.now() + 10 * 60_000, tries: 0, sentAt: Date.now() });
  return { code };
}

export async function verifyCode(channel: "email" | "phone", target: string, code: string): Promise<boolean> {
  const key = `${channel}:${target}`;
  const cur = await store.get<Otp>(OTP, key);
  if (!cur || cur.exp < Date.now() || cur.tries >= 5) return false;
  if (cur.hash !== hash(code.replace(/\D/g, ""))) { await store.set<Otp>(OTP, key, { ...cur, tries: cur.tries + 1 }); return false; }
  await store.remove(OTP, key);
  return true;
}

export function publicAccount(a: Account) {
  return { id: a.id, name: a.name ?? a.email?.split("@")[0] ?? a.phone ?? "Aetheris user", email: a.email, phone: a.phone, avatar: a.avatar, providers: Object.keys(a.providers) };
}
