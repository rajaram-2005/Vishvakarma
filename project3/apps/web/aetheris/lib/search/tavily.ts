/**
 * Web search grounding via Tavily (1,000 free searches / month per key).
 * The key comes from the request (BYOK, stored client-side), the app's runtime key store
 * (Settings → API keys), or TAVILY_API_KEY as a server default.
 */
import { runtimeKeyFor } from "@/aetheris/lib/router/runtimeKeys";
export interface SearchResult { title: string; url: string; content: string; score?: number }
export interface SearchResponse { query: string; answer?: string; results: SearchResult[] }

export function searchKeyFor(reqKey?: string): string | undefined {
  const k = (reqKey ?? "").trim() || runtimeKeyFor("TAVILY_API_KEY") || (process.env.TAVILY_API_KEY ?? "").trim();
  return k || undefined;
}

export async function searchWeb(query: string, key: string, opts: { maxResults?: number; depth?: "basic" | "advanced"; signal?: AbortSignal } = {}): Promise<SearchResponse> {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      query: query.slice(0, 400),
      max_results: opts.maxResults ?? 6,
      search_depth: opts.depth ?? "basic",
      include_answer: "basic",
    }),
    signal: opts.signal,
  });
  if (!res.ok) throw new Error(`Tavily ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = (await res.json()) as { answer?: string; results?: { title: string; url: string; content: string; score?: number }[] };
  return { query, answer: j.answer, results: (j.results ?? []).map((r) => ({ title: r.title, url: r.url, content: (r.content ?? "").slice(0, 1500), score: r.score })) };
}

/** Cheap heuristic for "auto" web mode: does this prompt probably need fresh/external facts? */
export function looksTimeSensitive(text: string): boolean {
  const t = text.toLowerCase();
  if (t.length < 8) return false;
  if (/\b(20(2[4-9]|3\d))\b/.test(t)) return true;
  return /\b(latest|today|yesterday|tonight|this (week|month|year)|current(ly)?|recent(ly)?|news|breaking|price|stock|score|weather|forecast|release[sd]?|announce[sd]?|who (won|is the)|when (is|does|did)|how much (is|does)|near me|open now|version|changelog|deadline|schedule)\b/.test(t);
}

/** Format results as a grounding block for the system prompt. */
export function groundingBlock(r: SearchResponse): string {
  const lines = r.results.map((x, i) => `[${i + 1}] ${x.title}\nURL: ${x.url}\n${x.content}`);
  return `WEB SEARCH RESULTS for "${r.query}" (retrieved just now):\n\n${lines.join("\n\n")}\n\n` +
    `Use these results to answer. Cite sources inline as [n] matching the numbers above. If the results do not cover the question, say so.`;
}
