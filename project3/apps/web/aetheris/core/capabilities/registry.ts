/**
 * Capability Registry — discovery, search and ranking of everything Aetheris can do.
 * Sources register lazily; results are cached with a short TTL so catalogs can be large.
 */
import { SECURITY_RANK, type Capability, type CapabilityQuery, type CapabilitySource, type CapabilityStatus } from "./types";

const sources = new Map<string, CapabilitySource>();
let cache: { at: number; items: Capability[] } | null = null;
const TTL = 30_000;

export function registerSource(src: CapabilitySource) { sources.set(src.id, src); cache = null; }
export function unregisterSource(id: string) { sources.delete(id); cache = null; }
export function invalidate() { cache = null; }

export async function allCapabilities(): Promise<Capability[]> {
  if (cache && Date.now() - cache.at < TTL) return cache.items;
  const lists = await Promise.all([...sources.values()].map(async (s) => { try { return await s.list(); } catch (e) { console.warn(`[aetheris] capability source ${s.id} failed`, (e as Error).message); return []; } }));
  const seen = new Set<string>(); const items: Capability[] = [];
  for (const c of lists.flat()) { if (seen.has(c.id)) continue; seen.add(c.id); items.push(c); }
  cache = { at: Date.now(), items };
  return items;
}

export async function getCapability(id: string) { return (await allCapabilities()).find((c) => c.id === id) ?? null; }

const STOP = new Set(["my","me","the","a","an","to","of","and","or","for","in","on","with","this","that","is","it","at","by","from","be","do","can","you","please","want","need","how","what"]);
const tok = (s: string) => s.toLowerCase().split(/[^a-z0-9\u0B80-\u0BFF\u0900-\u097F]+/).filter((t) => t.length > 1 && !STOP.has(t));

/** Score a capability against a free-text query (name > tags > description). Pure, exported for tests. */
export function scoreCapability(c: Capability, q: string): number {
  const qs = tok(q); if (!qs.length) return 0;
  const name = tok(c.name + " " + c.id), tags = c.tags.map((t) => t.toLowerCase()), desc = tok(c.description);
  let s = 0;
  for (const t of qs) {
    if (name.includes(t)) s += 3; else if (name.some((n) => n.startsWith(t) || t.startsWith(n))) s += 1.5;
    if (tags.includes(t)) s += 2.5; else if (tags.some((g) => g.includes(t))) s += 1;
    if (desc.includes(t)) s += 1;
  }
  // status & verification weighting: prefer things that actually work
  const statusW: Record<CapabilityStatus, number> = { implemented: 1, partial: 0.85, experimental: 0.7, mocked: 0.2, not_available: 0 };
  s *= statusW[c.status];
  if (c.verification_status === "verified") s *= 1.1;
  if (c.reliability !== undefined) s *= 0.7 + 0.3 * c.reliability;
  return s;
}

export async function searchCapabilities(query: CapabilityQuery): Promise<Capability[]> {
  let items = await allCapabilities();
  if (query.category) { const cats = Array.isArray(query.category) ? query.category : [query.category]; items = items.filter((c) => cats.includes(c.category)); }
  if (query.status) items = items.filter((c) => query.status!.includes(c.status));
  if (query.tags?.length) items = items.filter((c) => query.tags!.every((t) => c.tags.includes(t)));
  if (query.maxSecurity) items = items.filter((c) => SECURITY_RANK[c.security_level] <= SECURITY_RANK[query.maxSecurity!]);
  if (query.q?.trim()) items = items.map((c) => ({ c, s: scoreCapability(c, query.q!) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).map((x) => x.c);
  return items.slice(0, query.limit ?? 50);
}

export async function registrySummary() {
  const items = await allCapabilities();
  const by = <K extends string>(f: (c: Capability) => K) => items.reduce((m, c) => { const k = f(c); m[k] = (m[k] ?? 0) + 1; return m; }, {} as Record<K, number>);
  return { total: items.length, sources: [...sources.keys()], byCategory: by((c) => c.category), byStatus: by((c) => c.status), bySecurity: by((c) => c.security_level) };
}
