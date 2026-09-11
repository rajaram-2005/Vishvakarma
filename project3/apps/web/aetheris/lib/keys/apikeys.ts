/**
 * Personal Aetheris API keys ("sk-aeth-…"). Users mint them for their plan; the key maps back
 * to the user's uid so plan limits + credits apply. Only a SHA-256 hash is stored.
 */
import { createHash, randomBytes } from "node:crypto";
import { store } from "@/aetheris/lib/store";
import { planFor } from "@/aetheris/lib/billing/entitlements";

export interface ApiKey {
  id: string;         // public id (first 8 chars of hash)
  uid: string;
  name: string;
  hash: string;
  prefix: string;     // "sk-aeth-abcd" for display
  model: string;      // default model tier for this key
  createdAt: number;
  lastUsedAt?: number;
  calls: number;
}

const COLL = "apikeys";
const hash = (k: string) => createHash("sha256").update(k).digest("hex");

export async function listKeys(uid: string): Promise<Omit<ApiKey, "hash">[]> {
  const all = Object.values(await store.all<ApiKey>(COLL));
  return all.filter((k) => k.uid === uid).sort((a, b) => a.createdAt - b.createdAt).map(({ hash: _h, ...k }) => k);
}

export async function createKey(uid: string, name: string, model: string): Promise<{ key: string; record: Omit<ApiKey, "hash"> }> {
  const plan = await planFor(uid);
  const mine = await listKeys(uid);
  if (plan.apiKeys === 0) throw Object.assign(new Error("API keys need a paid plan (Lite and above)."), { code: "upgrade" });
  if (mine.length >= plan.apiKeys) throw Object.assign(new Error(`Your ${plan.name} plan allows ${plan.apiKeys} API key${plan.apiKeys > 1 ? "s" : ""}. Delete one or upgrade.`), { code: "upgrade" });
  const secret = "sk-aeth-" + randomBytes(24).toString("base64url");
  const h = hash(secret);
  const rec: ApiKey = { id: h.slice(0, 8), uid, name: name.trim().slice(0, 40) || "default", hash: h, prefix: secret.slice(0, 12) + "…", model, createdAt: Date.now(), calls: 0 };
  await store.set(COLL, rec.id, rec);
  const { hash: _x, ...pub } = rec;
  return { key: secret, record: pub };
}

export async function revokeKey(uid: string, id: string): Promise<void> {
  const k = await store.get<ApiKey>(COLL, id);
  if (k && k.uid === uid) await store.remove(COLL, id);
}

/** Resolve a bearer token to its owner. Returns null for unknown/invalid keys. */
export async function authenticateKey(token: string): Promise<ApiKey | null> {
  if (!token.startsWith("sk-aeth-")) return null;
  const h = hash(token);
  const k = await store.get<ApiKey>(COLL, h.slice(0, 8));
  if (!k || k.hash !== h) return null;
  store.update<ApiKey>(COLL, k.id, (cur) => ({ ...(cur ?? k), lastUsedAt: Date.now(), calls: (cur?.calls ?? 0) + 1 })).catch(() => undefined);
  return k;
}
