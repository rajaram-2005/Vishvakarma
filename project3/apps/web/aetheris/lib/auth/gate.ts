/**
 * Edge-safe authentication gate helpers.
 *
 * Account sessions are AES-256-GCM cookies produced by src/lib/crypto.ts. Middleware cannot use
 * node:crypto, so validation is repeated here with Web Crypto before a protected page or API is
 * allowed through. The actual account is still resolved by server routes; this is the coarse gate.
 */

const DEV_SECRET = "aetheris-dev-secret-do-not-use-in-prod";
type AuthEnvironment = Readonly<Record<string, string | undefined>>;

/**
 * Web access is anonymous-first by default — but a public hosted instance flips the gate with
 * AETHERIS_REQUIRE_LOGIN=1, and middleware then requires a valid account session everywhere
 * except isPublicAuthPath(). The UI reads the same flag via /api/auth/session to adapt.
 */
export function authenticationRequired(env: AuthEnvironment = process.env): boolean {
  return env.AETHERIS_REQUIRE_LOGIN === "1";
}

export function guestAccessEnabled(env: AuthEnvironment = process.env): boolean {
  return env.AETHERIS_GUEST_ACCESS === "1";
}

function decodeBase64Url(value: string): Uint8Array | null {
  try {
    const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
    const binary = atob(base64);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}

/** Cryptographically validate the sealed session and its expiration without exposing its payload. */
export async function validSessionCookie(raw: string | undefined, env: AuthEnvironment = process.env): Promise<boolean> {
  if (!raw) return false;
  const bytes = decodeBase64Url(raw);
  // Layout from lib/crypto: 12-byte IV | 16-byte GCM tag | ciphertext.
  if (!bytes || bytes.length <= 29) return false;

  const secret = env.AETHERIS_SECRET || (env.NODE_ENV === "production" ? "" : DEV_SECRET);
  if (!secret) return false;

  try {
    const iv = bytes.slice(0, 12);
    const tag = bytes.slice(12, 28);
    const ciphertext = bytes.slice(28);
    const encrypted = new Uint8Array(ciphertext.length + tag.length);
    encrypted.set(ciphertext);
    encrypted.set(tag, ciphertext.length);

    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
    const key = await crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["decrypt"]);
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, encrypted);
    const value = JSON.parse(new TextDecoder().decode(plain)) as { id?: unknown; exp?: unknown };
    return typeof value.id === "string"
      && /^[a-f0-9]{24}$/.test(value.id)
      && typeof value.exp === "number"
      && Number.isFinite(value.exp)
      && value.exp > Date.now();
  } catch {
    return false;
  }
}

/** Pages and service endpoints which must remain reachable before/without an interactive session. */
export function isPublicAuthPath(path: string, method: string): boolean {
  if (path === "/" || path.startsWith("/docs") || path.startsWith("/s/")) return true;
  if (path === "/manifest.webmanifest" || path === "/sw.js" || path === "/icon.svg" || /\.(?:png|jpg|jpeg|svg|ico|webp|woff2?)$/i.test(path)) return true;
  if (path.startsWith("/api/auth/") || path === "/api/health" || path === "/api/version") return true;
  if (method === "GET" && path.startsWith("/api/share/")) return true;
  // These endpoints carry their own non-browser authentication (API key, hook token, or cron secret).
  if (path.startsWith("/api/v1/") || /^\/api\/automations\/[^/]+\/hook$/.test(path) || path === "/api/schedules/tick") return true;
  return false;
}
