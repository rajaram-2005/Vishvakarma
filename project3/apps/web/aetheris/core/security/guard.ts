/**
 * Security primitives (Phase 17) — used by routes and core modules.
 *
 *   rateLimit(key, {limit, windowMs})  in-memory sliding window per key (uid / ip / route); honest: per-instance
 *   ssrfCheck(url)                     blocks private/loopback/link-local/metadata targets and non-http schemes,
 *                                      resolving DNS so hostnames can't hide 127.0.0.1 (allow via AETHERIS_ALLOW_PRIVATE_URLS=1)
 *   redactSecrets(text)                masks API keys / bearer tokens / long hex before anything is logged or shown
 *   auditExport(uid, since)            the user's own permission/device/execution/mcp events — from the event buffer
 */
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { query, queryAsync, type AetherisEvent } from "../observability/events";

const buckets = new Map<string, number[]>();
export function rateLimit(key: string, opts: { limit: number; windowMs: number }, now = Date.now()): { ok: boolean; remaining: number; retryAfterSec: number } {
  const w = (buckets.get(key) ?? []).filter((t) => now - t < opts.windowMs);
  if (w.length >= opts.limit) { buckets.set(key, w); return { ok: false, remaining: 0, retryAfterSec: Math.ceil((w[0] + opts.windowMs - now) / 1000) }; }
  w.push(now); buckets.set(key, w); if (buckets.size > 50_000) buckets.clear();
  return { ok: true, remaining: opts.limit - w.length, retryAfterSec: 0 };
}
export const LIMITS = { write: { limit: 60, windowMs: 60_000 }, heavy: { limit: 12, windowMs: 60_000 }, physical: { limit: 30, windowMs: 60_000 }, hook: { limit: 120, windowMs: 60_000 } } as const;

/** Pure: is this IP private/loopback/link-local/metadata/CGNAT? (tested) */
export function isPrivateIp(ip: string): boolean {
  if (ip.startsWith("::ffff:")) ip = ip.slice(7);
  if (isIP(ip) === 4) { const [a, b] = ip.split(".").map(Number); return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127); }
  const l = ip.toLowerCase(); return l === "::1" || l === "::" || l.startsWith("fe80:") || l.startsWith("fc") || l.startsWith("fd");
}
/** Reject URLs that would let a user make the server call internal services. */
export async function ssrfCheck(raw: string, opts: { allowHttp?: boolean; allowPrivate?: boolean } = {}): Promise<{ ok: true; url: URL } | { ok: false; reason: string }> {
  let u: URL; try { u = new URL(raw); } catch { return { ok: false, reason: "invalid url" }; }
  if (u.protocol !== "https:" && !(opts.allowHttp && u.protocol === "http:")) return { ok: false, reason: `scheme ${u.protocol} not allowed` };
  if (u.username || u.password) return { ok: false, reason: "credentials in url not allowed" };
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (host === "metadata.google.internal" || host === "169.254.169.254") return { ok: false, reason: "metadata endpoint blocked" };
  const allowPrivate = opts.allowPrivate ?? process.env.AETHERIS_ALLOW_PRIVATE_URLS === "1";
  if (allowPrivate) return { ok: true, url: u };
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal")) return { ok: false, reason: "internal host blocked" };
  if (isIP(host)) return isPrivateIp(host) ? { ok: false, reason: "private address blocked" } : { ok: true, url: u };
  try { const addrs = await lookup(host, { all: true }); if (addrs.some((a) => isPrivateIp(a.address))) return { ok: false, reason: "host resolves to a private address" }; } catch { return { ok: false, reason: "host does not resolve" }; }
  return { ok: true, url: u };
}
/** Pure: mask secrets (tested). */
export function redactSecrets(text: string): string {
  return text
    .replace(/\b(sk|gsk|xai|hf|ghp|gho|github_pat|nvapi|AIza|pk|rk)[-_][A-Za-z0-9_\-]{12,}/g, (m) => m.slice(0, 6) + "…" + m.slice(-3))
    .replace(/\b(Bearer\s+)[A-Za-z0-9._\-]{16,}/gi, "$1•••")
    .replace(/\b[0-9a-f]{40,}\b/gi, (m) => m.slice(0, 6) + "…")
    .replace(/("?(?:password|secret|token|api[_-]?key|authorization)"?\s*[:=]\s*"?)([^"\s,}]{4,})/gi, "$1•••");
}
export function auditExport(uid: string, since?: number) {
  return redactAudit(query({ uid, since, limit: 2000 }));
}
/** Async twin: identical output, reads the pg log in hosted mode. Routes use this. */
export async function auditExportAsync(uid: string, since?: number) {
  return redactAudit(await queryAsync({ uid, since, limit: 2000 }));
}
function redactAudit(rows: AetherisEvent[]) {
  return rows.filter((e) => ["permission", "device", "execution", "mcp", "auth", "error"].includes(e.type)).map((e) => ({ ...e, detail: e.detail ? redactSecrets(e.detail) : e.detail }));
}
export const toCsv = (rows: Record<string, unknown>[]) => { if (!rows.length) return ""; const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))]; const esc = (v: unknown) => `"${String(v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : v).replace(/"/g, '""')}"`; return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n"); };
