import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { unseal } from "@/aetheris/lib/crypto";
import { store } from "@/aetheris/lib/store";

export const UID_COOKIE = "aetheris_uid";

export class AuthenticationRequiredError extends Error {
  constructor() {
    super("A signed-in Aetheris account is required.");
    this.name = "AuthenticationRequiredError";
  }
}

export async function authenticatedUid(raw: string | undefined): Promise<string | null> {
  if (!raw) return null;
  const plain = unseal(raw);
  if (!plain) return null;
  try {
    const session = JSON.parse(plain) as { id?: unknown; uid?: unknown; exp?: unknown };
    if (typeof session.id !== "string" || !/^[a-f0-9]{24}$/.test(session.id) || typeof session.exp !== "number" || session.exp <= Date.now()) return null;
    // Compatibility for sessions issued before uid was included in the sealed payload.
    if (typeof session.uid === "string" && /^[a-f0-9]{32}$/.test(session.uid)) return session.uid;
    const account = await store.get<{ uid?: string }>("accounts", session.id);
    return account?.uid && /^[a-f0-9]{32}$/.test(account.uid) ? account.uid : null;
  } catch {
    return null;
  }
}

/** Resolve the browser-local owner id. The app is anonymous-first and never requires a name or login to chat. */
export async function getUserId(options: { allowAnonymous?: boolean; freshAnonymous?: boolean } = {}): Promise<{ uid: string; isNew: boolean }> {
  const jar = await cookies();
  if (options.freshAnonymous) return { uid: randomBytes(16).toString("hex"), isNew: true };

  const existing = jar.get(UID_COOKIE)?.value;
  if (existing && /^[a-f0-9]{32}$/.test(existing)) return { uid: existing, isNew: false };
  return { uid: randomBytes(16).toString("hex"), isNew: true };
}

/** Should the anonymous uid cookie carry the Secure attribute? */
function cookieSecure(): boolean {
  // In production behind a real deployment HTTPS is the norm, but plain-HTTP
  // hosts (LAN, `next start` on localhost, Docker on a private network) must
  // keep cookies non-secure — otherwise browsers drop them and every request
  // rotates a fresh anonymous uid, breaking schedules/memory/kb persistence.
  if (process.env.NODE_ENV !== 'production') return false;
  if (process.env.NEXT_PUBLIC_APP_URL) {
    try {
      return new URL(process.env.NEXT_PUBLIC_APP_URL).protocol === 'https:';
    } catch {
      /* fall through */
    }
  }
  // No canonical URL configured → assume plain-HTTP self-hosting
  // (Render/Fly/Vercel inject their own public URL; the Dockerfile ships none).
  return false;
}

export function uidCookie(uid: string) {
  return {
    name: UID_COOKIE,
    value: uid,
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: cookieSecure(),
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  };
}
