/**
 * Aetheris Summarizer — an own, offline extractive summarization model.
 * Frequency-weighted sentence scoring, fully deterministic and local.
 */

const STOP = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'for', 'with', 'at', 'by', 'from', 'as', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'it', 'its', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'we', 'they', 'them', 'his', 'her', 'their', 'our', 'your', 'my', 'me', 'us', 'do', 'does', 'did', 'not', 'no', 'so', 'if', 'then', 'than', 'also', 'very', 'just', 'can', 'will', 'would', 'should', 'could', 'may', 'might', 'has', 'have', 'had', 'what', 'when', 'where', 'which', 'who', 'whom', 'why', 'how', 'all', 'any', 'each', 'more', 'most', 'other', 'some', 'such', 'only', 'own', 'same', 'into', 'over', 'after', 'before', 'between', 'under', 'again', 'further', 'once', 'here', 'there', 'about', 'because', 'while', 'during', 'both', 'few', 'many', 'must', 'now', 'still', 'too', 'until', 'up', 'down', 'out', 'off', 'above', 'below']);

export function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 24);
}

function words(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z0-9\s'-]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));
}

export function scoreSentences(sentences: string[]): Array<{ s: string; score: number }> {
  const freq = new Map<string, number>();
  for (const s of sentences) for (const w of words(s)) freq.set(w, (freq.get(w) ?? 0) + 1);
  return sentences.map((s) => {
    const ws = words(s);
    if (!ws.length) return { s, score: 0 };
    const sum = ws.reduce((a, w) => a + (freq.get(w) ?? 0), 0);
    return { s, score: sum / ws.length };
  });
}

function summarize(text: string, count: number): string {
  const sentences = splitSentences(text);
  if (sentences.length <= count) return sentences.join(' ');
  const scored = scoreSentences(sentences).sort((a, b) => b.score - a.score).slice(0, count);
  // restore original order
  return scored
    .sort((a, b) => sentences.indexOf(a.s) - sentences.indexOf(b.s))
    .map((x) => x.s)
    .join(' ');
}

/** The summarizer model's entry point. */
export function summarizerAnswer(prompt: string): string {
  const src = prompt.replace(/^(please\s+)?summari[sz]e\s+(the\s+)?(following\s+)?(text|document|article|paragraph)?\s*:?\s*/i, '').trim();
  if (src.length < 80) return '';
  const lower = prompt.toLowerCase();
  const bullets = /bullet|key points|list/.test(lower);
  const n = bullets ? 5 : 3;
  const sentences = splitSentences(src);
  const scored = scoreSentences(sentences).sort((a, b) => b.score - a.score).slice(0, Math.min(n, sentences.length))
    .sort((a, b) => sentences.indexOf(a.s) - sentences.indexOf(b.s));
  if (!scored.length) return '';
  const body = bullets
    ? scored.map((x) => `• ${x.s}`).join('\n')
    : scored.map((x) => x.s).join(' ');
  const ratio = Math.round((body.length / src.length) * 100);
  return `**Summary** (${scored.length} sentences · ${ratio}% of source)\n\n${body}\n\nExtractive and deterministic — Aetherion Summarizer scored every sentence by term frequency and kept the highest-ranked, in original order.`;
}
