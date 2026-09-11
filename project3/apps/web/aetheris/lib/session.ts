/**
 * Session layer.
 *
 *   A small, focused module that wraps the existing
 *   sealed-cookie + accounts-store model into a single
 *   API:
 *     - issueSession(uid, ttlMs?)  → sealed cookie payload
 *     - resolveSession(sealed)     → { uid, accountId, exp } | null
 *     - requireSession(sealed)     → throws if missing/expired
 *     - hasSession(sealed)         → boolean
 *
 *   The module does not depend on Next's cookies(); it
 *   takes the sealed payload as input. This makes the
 *   surface unit-testable under node:test, which is the
 *   whole point of deepening #9: today the auth lives
 *   inside getUserId() which is hard to test. This module
 *   gives us a focused, testable core.
 *
 *   The module is honest: it does not invent sessions.
 *   A sealed payload that fails to unseal, or whose exp
 *   is in the past, returns null. requireSession() throws
 *   an AuthenticationRequiredError.
 */

import { randomBytes } from "node:crypto";
import { seal, unseal } from "@/aetheris/lib/crypto";
import { store } from "@/aetheris/lib/store";

export interface SessionPayload {
  id: string; // account id
  uid: string;
  exp: number; // epoch ms
}

const DEFAULT_TTL = 24 * 60 * 60_000; // 24h

export function issueSession(accountId: string, uid: string, ttlMs: number = DEFAULT_TTL): string {
  const payload: SessionPayload = { id: accountId, uid, exp: Date.now() + ttlMs };
  return seal(JSON.stringify(payload));
}

export interface ResolvedSession {
  accountId: string;
  uid: string;
  exp: number;
}

export function resolveSession(sealed: string | undefined | null): ResolvedSession | null {
  if (!sealed) return null;
  const plain = unseal(sealed);
  if (!plain) return null;
  try {
    const p = JSON.parse(plain) as Partial<SessionPayload>;
    if (typeof p.id !== "string" || typeof p.uid !== "string" || typeof p.exp !== "number") return null;
    if (p.exp <= Date.now()) return null;
    if (!/^[a-f0-9]{32}$/.test(p.uid)) return null;
    return { accountId: p.id, uid: p.uid, exp: p.exp };
  } catch {
    return null;
  }
}

export function hasSession(sealed: string | undefined | null): boolean {
  return resolveSession(sealed) !== null;
}

export class AuthenticationRequiredError extends Error {
  constructor(message = "session missing or expired") {
    super(message);
    this.name = "AuthenticationRequiredError";
  }
}

export function requireSession(sealed: string | undefined | null): ResolvedSession {
  const r = resolveSession(sealed);
  if (!r) throw new AuthenticationRequiredError();
  return r;
}

/** For testing: create a fresh account id. */
export function newAccountId(): string {
  return randomBytes(12).toString("hex");
}

/** For testing: create a fresh uid. */
export function newUid(): string {
  return randomBytes(16).toString("hex");
}

/** Persist a (uid → accountId) row in the accounts store. */
export async function persistAccount(uid: string, accountId: string): Promise<void> {
  if (!/^[a-f0-9]{32}$/.test(uid)) throw new Error("invalid uid");
  if (!/^[a-f0-9]{24}$/.test(accountId)) throw new Error("invalid accountId");
  await store.set("accounts", accountId, { uid, createdAt: Date.now() });
}
