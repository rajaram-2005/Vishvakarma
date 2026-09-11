/**
 * Rate limiting with a shared backend when one is configured.
 *
 * Upstash Redis (Vercel Marketplace) via its REST API when UPSTASH_REDIS_REST_URL +
 * UPSTASH_REDIS_REST_TOKEN are set: one pipelined round trip per check (SET NX with TTL to open
 * the window, INCR to count, PTTL for Retry-After). Otherwise a per-instance in-memory sliding
 * window — the long-standing middleware behaviour.
 *
 * The limiter fails OPEN: a Redis outage or timeout degrades to "allowed" (recorded nowhere —
 * this module is edge-safe and dependency-free on purpose) rather than taking the site down.
 * Edge-safe: `fetch` only, no node imports.
 */

export interface RateLimitCheck { key: string; limit: number; windowMs: number }
export interface RateLimitResult { allowed: boolean; retryAfterSec: number }

type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;
let testFetch: FetchFn | null = null;
/** Tests only: stub the Upstash transport. */
export function __setRateLimitFetchForTests(f: FetchFn | null) {
  testFetch = f;
}
const http: FetchFn = (url, init) => (testFetch ?? fetch)(url, init);

const mem = new Map<string, number[]>();

function memoryCheck({ key, limit, windowMs }: RateLimitCheck): RateLimitResult {
  const now = Date.now();
  const w = (mem.get(key) ?? []).filter((t) => now - t < windowMs);
  if (w.length >= limit) {
    return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((w[0]! + windowMs - now) / 1000)) };
  }
  w.push(now);
  mem.set(key, w);
  if (mem.size > 20_000) mem.clear();
  return { allowed: true, retryAfterSec: 0 };
}

function num(v: unknown, fallback: number): number {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : fallback;
  return Number.isFinite(n) ? n : fallback;
}

async function upstashCheck(base: string, token: string, { key, limit, windowMs }: RateLimitCheck): Promise<RateLimitResult> {
  const windowSec = Math.max(1, Math.ceil(windowMs / 1000));
  const res = await http(`${base}/pipeline`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify([
      ["SET", key, "0", "EX", String(windowSec), "NX"],
      ["INCR", key],
      ["PTTL", key],
    ]),
    signal: AbortSignal.timeout(800),
  });
  if (!res.ok) throw new Error(`upstash ${res.status}`);
  const raw = (await res.json()) as unknown;
  const arr = Array.isArray(raw) ? raw : (raw as { result?: unknown }).result;
  if (!Array.isArray(arr) || arr.length < 3) throw new Error("upstash: unexpected pipeline shape");
  const count = num((arr[1] as { result?: unknown })?.result, 0);
  const pttl = num((arr[2] as { result?: unknown })?.result, -1);
  if (count <= limit) return { allowed: true, retryAfterSec: 0 };
  return { allowed: false, retryAfterSec: pttl > 0 ? Math.ceil(pttl / 1000) : windowSec };
}

export async function checkRateLimit(check: RateLimitCheck): Promise<RateLimitResult> {
  const base = process.env.UPSTASH_REDIS_REST_URL?.replace(/\/+$/, "");
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (base && token) {
    try {
      return await upstashCheck(base, token, check);
    } catch {
      return { allowed: true, retryAfterSec: 0 }; // fail open: the site stays up when Redis is down
    }
  }
  return memoryCheck(check);
}

/** Tests only: clear the in-memory fallback windows. */
export function __clearRateLimitMemoryForTests() {
  mem.clear();
}
