/** Relevance scoring for gallery search. Pure, so it's unit-testable. */
export interface Searchable { title: string; description: string; prompt: string; tags: string[]; agents: string[] }

const norm = (s: string) => s.toLowerCase();
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Score one field for one term: whole word 3, word prefix 2, substring 1, none 0. */
export function fieldScore(field: string, term: string): number {
  const f = norm(field); if (!f.includes(term)) return 0;
  if (new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(term)}($|[^\\p{L}\\p{N}])`, "u").test(f)) return 3;
  if (new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(term)}`, "u").test(f)) return 2;
  return 1;
}

export function tokenize(q: string): string[] {
  return Array.from(new Set(norm(q).split(/\s+/).map((t) => t.replace(/^[@#]/, "").trim()).filter((t) => t.length >= 2)));
}

/**
 * Score an item for a query. Every term must match somewhere (AND); returns 0 otherwise.
 * Weights: title 10, tags/agents 6, description 3, prompt 1. Exact title match gets a large bonus.
 */
export function scoreItem(item: Searchable, q: string): number {
  const terms = tokenize(q); if (!terms.length) return 1;
  let total = 0;
  for (const t of terms) {
    const s = Math.max(
      fieldScore(item.title, t) * 10,
      Math.max(0, ...item.tags.map((x) => fieldScore(x, t))) * 6,
      Math.max(0, ...item.agents.map((x) => fieldScore(x, t))) * 6,
      fieldScore(item.description, t) * 3,
      fieldScore(item.prompt, t) * 1,
    );
    if (!s) return 0;
    total += s;
  }
  if (norm(item.title) === norm(q).trim()) total += 100;
  return total;
}

/** Filter + rank; ties broken by the caller-provided popularity comparator. */
export function rankItems<T extends Searchable>(items: T[], q: string, tie: (a: T, b: T) => number): T[] {
  if (!q.trim()) return items.slice().sort(tie);
  return items.map((item) => ({ item, s: scoreItem(item, q) })).filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || tie(a.item, b.item)).map((x) => x.item);
}
