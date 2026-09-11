import { traced } from "@/aetheris/core/observability/events";
/**
 * Deep Research — multi-step agent: plan sub-questions → parallel web searches →
 * per-question notes → cited long-form report. Emits progress events for the UI.
 */
import { route } from "@/aetheris/lib/router/router";
import { searchWeb, type SearchResult } from "@/aetheris/lib/search/tavily";
import type { ChatMessage } from "@/aetheris/lib/router/types";

export type ResearchEvent =
  | { type: "plan"; questions: string[] }
  | { type: "search"; question: string; count: number; provider?: string }
  | { type: "notes"; question: string; provider: string }
  | { type: "writing"; provider?: string }
  | { type: "delta"; text: string }
  | { type: "done"; report: string; sources: SearchResult[]; provider: string; model: string; durationMs: number }
  | { type: "error"; error: string };

function extractJsonArray(s: string): string[] {
  const m = /\[[\s\S]*\]/.exec(s);
  if (!m) return [];
  try { const a = JSON.parse(m[0]); return Array.isArray(a) ? a.map(String).filter(Boolean) : []; } catch { return []; }
}

export async function deepResearch(opts: {
  topic: string;
  searchKey: string;
  preferred?: string;
  breadth?: number;
  signal?: AbortSignal;
  onEvent: (e: ResearchEvent) => void;
}): Promise<void> {
  return traced({ type: "tool", uid: undefined, capability: "research:deep" }, () => deepResearchInner(opts));
}
async function deepResearchInner(opts: {
  topic: string;
  searchKey: string;
  preferred?: string;
  breadth?: number;
  signal?: AbortSignal;
  onEvent: (e: ResearchEvent) => void;
}): Promise<void> {
  const started = Date.now();
  const emit = opts.onEvent;
  const breadth = Math.min(Math.max(opts.breadth ?? 5, 3), 8);
  const sys = (t: string): ChatMessage => ({ role: "system", content: t });

  // 1. Plan
  const plan = await route({
    preferred: opts.preferred, temperature: 0.3, signal: opts.signal,
    messages: [
      sys("You are a research planner. Reply ONLY with a JSON array of strings."),
      { role: "user", content: `Research topic: ${opts.topic}\n\nWrite ${breadth} distinct, specific web search queries that together would let an analyst write a thorough, up-to-date report on this topic. Cover background, current state, numbers/data, key players, controversies/risks, and outlook where relevant.` },
    ],
  });
  let questions = extractJsonArray(plan.content).slice(0, breadth);
  if (questions.length === 0) questions = [opts.topic];
  emit({ type: "plan", questions });

  // 2. Search in parallel
  const all: SearchResult[] = [];
  const perQ = await Promise.all(questions.map(async (q) => {
    try {
      const r = await searchWeb(q, opts.searchKey, { maxResults: 5, depth: "advanced", signal: opts.signal });
      emit({ type: "search", question: q, count: r.results.length });
      return { q, results: r.results, answer: r.answer };
    } catch (e) {
      emit({ type: "search", question: q, count: 0 });
      return { q, results: [] as SearchResult[], answer: undefined, error: (e as Error).message };
    }
  }));
  // Dedupe sources by URL, assign global citation numbers
  const index = new Map<string, number>();
  for (const { results } of perQ) for (const r of results) if (!index.has(r.url)) { index.set(r.url, all.push(r)); }
  const cite = (r: SearchResult) => `[${index.get(r.url)}]`;

  // 3. Notes per question (parallel, short)
  const notes = await Promise.all(perQ.map(async ({ q, results, answer }) => {
    if (results.length === 0) return `### ${q}\n(no results)`;
    const ctx = results.map((r) => `${cite(r)} ${r.title} — ${r.url}\n${r.content}`).join("\n\n");
    const r = await route({
      preferred: opts.preferred, temperature: 0.2, maxTokens: 700, signal: opts.signal,
      messages: [
        sys("You extract dense, factual research notes. Every claim must end with its citation number like [3]. No preamble."),
        { role: "user", content: `Question: ${q}\n${answer ? `Search engine summary: ${answer}\n` : ""}\nSources:\n${ctx}\n\nWrite 5-10 bullet notes answering the question with numbers, dates and names. Cite each bullet.` },
      ],
    });
    emit({ type: "notes", question: q, provider: r.provider });
    return `### ${q}\n${r.content}`;
  }));

  // 4. Report (streamed)
  emit({ type: "writing" });
  const bib = all.map((r, i) => `[${i + 1}] ${r.title} — ${r.url}`).join("\n");
  let report = "";
  const final = await route({
    preferred: opts.preferred, temperature: 0.4, signal: opts.signal,
    onDelta: (t) => { report += t; emit({ type: "delta", text: t }); },
    messages: [
      sys("You are a senior research analyst writing for a smart general reader. Write in Markdown with headings. Keep inline citations like [n] exactly as given in the notes; do not renumber or invent citations. Be concrete: numbers, dates, names. End with a short 'Bottom line' section. Do NOT include the bibliography — it is appended automatically."),
      { role: "user", content: `Topic: ${opts.topic}\n\nResearch notes:\n\n${notes.join("\n\n")}\n\nBibliography (for reference only):\n${bib}\n\nWrite the full report (600-1200 words).` },
    ],
  });
  report = final.content || report;
  const withBib = `${report.trim()}\n\n## Sources\n${bib}`;
  emit({ type: "done", report: withBib, sources: all, provider: final.provider, model: final.model, durationMs: Date.now() - started });
}
