import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/** Derive a 32-byte key from AETHERIS_SECRET (or a dev fallback with a loud warning). */
function key(): Buffer {
  let secret = process.env.AETHERIS_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") throw new Error("AETHERIS_SECRET must be set in production");
    secret = "aetheris-dev-secret-do-not-use-in-prod";
  }
  return createHash("sha256").update(secret).digest();
}

/** AES-256-GCM seal → base64url(iv | tag | ciphertext) */
export function seal(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]).toString("base64url");
}

export function unseal(token: string): string | null {
  try {
    const buf = Buffer.from(token, "base64url");
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const data = buf.subarray(28);
    const d = createDecipheriv("aes-256-gcm", key(), iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(data), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}
