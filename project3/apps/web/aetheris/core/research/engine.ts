/**
 * Research Engine (Phase 10) — academic + web evidence with a citation graph.
 *
 *   sources      arXiv (Atom API), Crossref, OpenAlex, Semantic Scholar — all keyless & free; web via Tavily key
 *   evidence     each paper → Evidence {id, title, authors, year, venue, doi, url, abstract, citations}
 *   citationGraph  references/cited-by (Semantic Scholar / OpenAlex) up to a bounded fan-out
 *   claims       LLM extracts claims from abstracts, maps each to ≥1 evidence id; flags contradictions
 *   report       cited synthesis (markdown) with a reproducibility/limitations section
 *   persist      findings can be stored as facts in the knowledge fabric with provenance kind "research"
 *
 * Status: IMPLEMENTED (network-dependent; each source fails independently and is reported as such).
 */
import { route } from "@/aetheris/lib/router/router";
import { searchWeb } from "@/aetheris/lib/search/tavily";
import { traced } from "../observability/events";

export interface Evidence { id: string; source: "arxiv" | "crossref" | "openalex" | "semanticscholar" | "web"; title: string; authors: string[]; year?: number; venue?: string; doi?: string; url: string; abstract?: string; citationCount?: number; s2Id?: string; openalexId?: string }
export interface Claim { text: string; support: string[]; stance: "supports" | "contradicts" | "neutral"; confidence: number }
export interface CitationEdge { from: string; to: string; kind: "cites" }
export interface ResearchReport { topic: string; evidence: Evidence[]; claims: Claim[]; contradictions: { a: Claim; b: Claim }[]; graph: CitationEdge[]; report: string; sourceStatus: Record<string, string>; provider: string; model: string; ms: number }

const UA = { "User-Agent": "aetheris-one research (mailto:ramkpraja175@gmail.com)" };
const jfetch = async <T>(url: string, ms = 15_000): Promise<T> => { const r = await fetch(url, { headers: { ...UA, Accept: "application/json" }, signal: AbortSignal.timeout(ms), cache: "no-store" }); if (!r.ok) throw new Error(`${new URL(url).host} → ${r.status}`); return r.json() as Promise<T>; };
const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export async function searchArxiv(q: string, n = 8): Promise<Evidence[]> {
  const r = await fetch(`http://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(q)}&max_results=${n}&sortBy=relevance`, { headers: UA, signal: AbortSignal.timeout(15_000) });
  if (!r.ok) throw new Error(`arxiv → ${r.status}`);
  return parseArxiv(await r.text());
}
/** Pure Atom parser for arXiv (tested). */
export function parseArxiv(xml: string): Evidence[] {
  const out: Evidence[] = [];
  for (const m of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const e = m[1]; const g = (tag: string) => (new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`).exec(e)?.[1] ?? "").replace(/\s+/g, " ").trim();
    const id = g("id"); if (!id) continue;
    out.push({ id: `arxiv:${id.split("/abs/")[1] ?? id}`, source: "arxiv", title: g("title"), authors: [...e.matchAll(/<name>([^<]+)<\/name>/g)].map((x) => x[1].trim()), year: Number(g("published").slice(0, 4)) || undefined, url: id, abstract: g("summary").slice(0, 1500), doi: /<arxiv:doi[^>]*>([^<]+)</.exec(e)?.[1] });
  }
  return out;
}
export async function searchCrossref(q: string, n = 8): Promise<Evidence[]> {
  const j = await jfetch<{ message: { items: { DOI: string; title?: string[]; author?: { given?: string; family?: string }[]; issued?: { "date-parts": number[][] }; "container-title"?: string[]; URL: string; abstract?: string; "is-referenced-by-count"?: number }[] } }>(`https://api.crossref.org/works?query=${encodeURIComponent(q)}&rows=${n}&select=DOI,title,author,issued,container-title,URL,abstract,is-referenced-by-count`);
  return j.message.items.map((it) => ({ id: `doi:${it.DOI.toLowerCase()}`, source: "crossref" as const, title: it.title?.[0] ?? "(untitled)", authors: (it.author ?? []).map((a) => [a.given, a.family].filter(Boolean).join(" ")), year: it.issued?.["date-parts"]?.[0]?.[0], venue: it["container-title"]?.[0], doi: it.DOI, url: it.URL, abstract: it.abstract?.replace(/<[^>]+>/g, "").slice(0, 1500), citationCount: it["is-referenced-by-count"] }));
}
export async function searchOpenAlex(q: string, n = 8): Promise<Evidence[]> {
  const j = await jfetch<{ results: { id: string; doi?: string; title: string; publication_year?: number; cited_by_count?: number; primary_location?: { source?: { display_name?: string }; landing_page_url?: string }; authorships?: { author: { display_name: string } }[]; abstract_inverted_index?: Record<string, number[]> }[] }>(`https://api.openalex.org/works?search=${encodeURIComponent(q)}&per-page=${n}&mailto=ramkpraja175@gmail.com`);
  return j.results.map((w) => ({ id: w.doi ? `doi:${w.doi.replace("https://doi.org/", "").toLowerCase()}` : `openalex:${w.id.split("/").pop()}`, source: "openalex" as const, title: w.title, authors: (w.authorships ?? []).map((a) => a.author.display_name), year: w.publication_year, venue: w.primary_location?.source?.display_name, doi: w.doi?.replace("https://doi.org/", ""), url: w.primary_location?.landing_page_url ?? w.id, abstract: w.abstract_inverted_index ? invertAbstract(w.abstract_inverted_index) : undefined, citationCount: w.cited_by_count, openalexId: w.id.split("/").pop() }));
}
/** Pure: rebuild OpenAlex inverted abstract (tested). */
export function invertAbstract(idx: Record<string, number[]>): string { const words: string[] = []; for (const [w, ps] of Object.entries(idx)) for (const p of ps) words[p] = w; return words.filter(Boolean).join(" ").slice(0, 1500); }
export async function searchSemanticScholar(q: string, n = 8): Promise<Evidence[]> {
  const j = await jfetch<{ data?: { paperId: string; title: string; year?: number; venue?: string; url: string; abstract?: string; citationCount?: number; externalIds?: { DOI?: string; ArXiv?: string }; authors?: { name: string }[] }[] }>(`https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(q)}&limit=${n}&fields=title,year,venue,url,abstract,citationCount,externalIds,authors`);
  return (j.data ?? []).map((p) => ({ id: p.externalIds?.DOI ? `doi:${p.externalIds.DOI.toLowerCase()}` : p.externalIds?.ArXiv ? `arxiv:${p.externalIds.ArXiv}` : `s2:${p.paperId}`, source: "semanticscholar" as const, title: p.title, authors: (p.authors ?? []).map((a) => a.name), year: p.year, venue: p.venue, doi: p.externalIds?.DOI, url: p.url, abstract: p.abstract?.slice(0, 1500), citationCount: p.citationCount, s2Id: p.paperId }));
}
/** Pure: merge duplicates across sources by DOI/arXiv id or normalised title (tested). */
export function dedupeEvidence(lists: Evidence[][]): Evidence[] {
  const byKey = new Map<string, Evidence>();
  for (const e of lists.flat()) {
    const key = e.doi ? `doi:${e.doi.toLowerCase()}` : e.id.startsWith("doi:") || e.id.startsWith("arxiv:") ? e.id.toLowerCase() : `t:${norm(e.title).slice(0, 80)}`;
    const cur = byKey.get(key);
    if (!cur) byKey.set(key, { ...e, id: key.startsWith("t:") ? e.id : key });
    else byKey.set(key, { ...cur, abstract: cur.abstract ?? e.abstract, citationCount: Math.max(cur.citationCount ?? 0, e.citationCount ?? 0) || undefined, venue: cur.venue ?? e.venue, s2Id: cur.s2Id ?? e.s2Id, openalexId: cur.openalexId ?? e.openalexId, authors: cur.authors.length ? cur.authors : e.authors });
  }
  return [...byKey.values()].sort((a, b) => (b.citationCount ?? 0) - (a.citationCount ?? 0));
}
/** Citation edges among the evidence set via Semantic Scholar references (bounded). */
export async function citationGraph(evidence: Evidence[], maxNodes = 8): Promise<CitationEdge[]> {
  const known = new Map<string, string>(); for (const e of evidence) { if (e.doi) known.set(`doi:${e.doi.toLowerCase()}`, e.id); if (e.s2Id) known.set(`s2:${e.s2Id}`, e.id); if (e.id.startsWith("arxiv:")) known.set(e.id, e.id); }
  const edges: CitationEdge[] = [];
  await Promise.all(evidence.filter((e) => e.s2Id || e.doi || e.id.startsWith("arxiv:")).slice(0, maxNodes).map(async (e) => {
    const pid = e.s2Id ?? (e.doi ? `DOI:${e.doi}` : `ARXIV:${e.id.slice(6)}`);
    try {
      const j = await jfetch<{ data?: { citedPaper: { paperId: string; externalIds?: { DOI?: string; ArXiv?: string } } }[] }>(`https://api.semanticscholar.org/graph/v1/paper/${encodeURIComponent(pid)}/references?fields=externalIds&limit=200`);
      for (const r of j.data ?? []) { const c = r.citedPaper; const hit = known.get(`s2:${c.paperId}`) ?? (c.externalIds?.DOI && known.get(`doi:${c.externalIds.DOI.toLowerCase()}`)) ?? (c.externalIds?.ArXiv && known.get(`arxiv:${c.externalIds.ArXiv}`)); if (hit && hit !== e.id) edges.push({ from: e.id, to: hit, kind: "cites" }); }
    } catch { /* one node failing must not sink the graph */ }
  }));
  return edges;
}
/** Pure: find contradicting claim pairs (same topic words, opposite stance) (tested). */
export function findContradictions(claims: Claim[]): { a: Claim; b: Claim }[] {
  const out: { a: Claim; b: Claim }[] = []; const words = (c: Claim) => new Set(norm(c.text).split(" ").filter((w) => w.length > 4));
  for (let i = 0; i < claims.length; i++) for (let j = i + 1; j < claims.length; j++) {
    const a = claims[i], b = claims[j]; if (a.stance === b.stance || a.stance === "neutral" || b.stance === "neutral") continue;
    const wa = words(a), wb = words(b); let common = 0; for (const w of wa) if (wb.has(w)) common++;
    if (common >= 2 && common / Math.min(wa.size, wb.size) >= 0.3) out.push({ a, b });
  }
  return out;
}

export async function research(opts: { topic: string; searchKey?: string; preferred?: string; perSource?: number; web?: boolean; onEvent?: (e: { type: string; detail?: string }) => void }): Promise<ResearchReport> {
  return traced({ type: "tool", capability: "research:engine", detail: opts.topic.slice(0, 80) }, async () => {
    const t0 = Date.now(); const n = opts.perSource ?? 6; const ev = (type: string, detail?: string) => opts.onEvent?.({ type, detail });
    const sourceStatus: Record<string, string> = {};
    const run = async (name: string, f: () => Promise<Evidence[]>) => { try { const r = await f(); sourceStatus[name] = `${r.length} results`; ev("source", `${name}: ${r.length}`); return r; } catch (e) { sourceStatus[name] = `unavailable: ${(e as Error).message}`; ev("source", `${name}: failed`); return []; } };
    const lists = await Promise.all([run("arxiv", () => searchArxiv(opts.topic, n)), run("crossref", () => searchCrossref(opts.topic, n)), run("openalex", () => searchOpenAlex(opts.topic, n)), run("semanticscholar", () => searchSemanticScholar(opts.topic, n)),
      opts.web !== false && opts.searchKey ? run("web", async () => (await searchWeb(opts.topic, opts.searchKey!, { maxResults: n })).results.map((r, i) => ({ id: `web:${i}:${new URL(r.url).host}`, source: "web" as const, title: r.title, authors: [], url: r.url, abstract: r.content.slice(0, 1200) }))) : Promise.resolve([])]);
    const evidence = dedupeEvidence(lists).slice(0, 24);
    if (!evidence.length) throw new Error(`no evidence found — sources: ${JSON.stringify(sourceStatus)}`);
    ev("graph"); const graph = await citationGraph(evidence);
    ev("claims");
    const claimsRes = await route({ preferred: opts.preferred, temperature: 0, maxTokens: 1800, messages: [
      { role: "system", content: 'Extract the key empirical/technical claims relevant to the topic from these sources. Output ONLY JSON: [{"text":"claim","support":["evidence ids"],"stance":"supports|contradicts|neutral","confidence":0-1}]. "stance" is relative to the topic\'s main hypothesis. Max 14 claims. Only cite ids given.' },
      { role: "user", content: `Topic: ${opts.topic}\n\n${evidence.map((e) => `[${e.id}] ${e.title} (${e.authors.slice(0, 3).join(", ")}${e.year ? ", " + e.year : ""}${e.citationCount != null ? ", cited " + e.citationCount : ""})\n${e.abstract ?? "(no abstract)"}`).join("\n\n")}` } ] });
    const cm = /\[[\s\S]*\]/.exec(claimsRes.content); const ids = new Set(evidence.map((e) => e.id));
    const claims: Claim[] = cm ? (JSON.parse(cm[0]) as Partial<Claim>[]).filter((c) => c.text).map((c) => ({ text: String(c.text), support: (c.support ?? []).filter((s) => ids.has(s)), stance: (["supports", "contradicts", "neutral"] as const).includes(c.stance as "neutral") ? (c.stance as Claim["stance"]) : "neutral", confidence: Math.max(0, Math.min(1, Number(c.confidence ?? 0.5))) })).filter((c) => c.support.length) : [];
    const contradictions = findContradictions(claims);
    ev("report");
    const rep = await route({ preferred: opts.preferred, temperature: 0.2, maxTokens: 2500, messages: [
      { role: "system", content: "Write a rigorous research brief in markdown: Summary · What the evidence says (cite [ids]) · Disagreements & open questions · Reproducibility & limitations (data availability, sample sizes, preprints vs peer-reviewed) · Suggested next reads. Cite only the given ids. Be explicit when evidence is thin." },
      { role: "user", content: `Topic: ${opts.topic}\nSources status: ${JSON.stringify(sourceStatus)}\nClaims:\n${claims.map((c) => `- (${c.stance}, ${c.confidence}) ${c.text} ← ${c.support.join(", ")}`).join("\n")}\nContradictions: ${contradictions.length}\nCitation edges among sources: ${graph.length}\n\nEvidence:\n${evidence.map((e) => `[${e.id}] ${e.title} — ${e.venue ?? e.source} ${e.year ?? ""} ${e.url}`).join("\n")}` } ] });
    return { topic: opts.topic, evidence, claims, contradictions, graph, report: rep.content, sourceStatus, provider: rep.provider, model: rep.model, ms: Date.now() - t0 };
  });
}
