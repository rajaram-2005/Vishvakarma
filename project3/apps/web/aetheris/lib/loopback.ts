/**
 * Loopback host detection, used by the edge middleware when the app runs as the server embedded in
 * the Aetheris desktop app (see `src/middleware.ts` and `desktop/src/lib/local-server.ts`).
 *
 * Lives in `lib/` rather than in `middleware.ts` because Next.js only allows `middleware` and
 * `config` exports from the middleware file — and this needs a unit test.
 */

/** `127.0.0.1:17890`, `localhost`, `[::1]:3000` → true. `evil.example`, `127.0.0.1.evil` → false. */
export function isLoopbackHost(host: string | null | undefined): boolean {
  if (!host) return false;
  // Take the hostname before any ":port". An IPv6 literal arrives bracketed (`[::1]:3000`), so the
  // brackets must be handled before splitting on ":" — stripping them first would leave "::1":3000"
  // splitting to an empty first field.
  const bracketed = /^\[([^\]]+)\]/.exec(host);
  const bare = (bracketed ? bracketed[1] : host.split(":")[0]).trim().toLowerCase();
  return bare === "127.0.0.1" || bare === "localhost" || bare === "::1";
}
