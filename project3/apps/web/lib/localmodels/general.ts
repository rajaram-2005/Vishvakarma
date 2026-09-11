/**
 * Aetherion Local — the general own-model. Offline assistant that
 * answers small talk, lists the family's capabilities, and routes
 * specialist intents (math / code / summary / data / story) to the
 * matching own-model. Honest about its limits.
 */

import { mathAnswer } from './math';
import { codeAnswer } from './code';
import { summarizerAnswer } from './summarizer';
import { analystAnswer } from './analyst';
import { writerAnswer } from './writer';

const FAMILY_LINES = [
  '**Aetherion Local** is my general model. The full on-device family:',
  '• **Aetherion Math** — real expression evaluation, equation solving, stats, primes, unit conversions',
  '• **Aetherion Coder** — code structure analysis, walkthroughs and deterministic snippets',
  '• **Aetherion Summarizer** — extractive, frequency-scored summaries of any pasted text',
  '• **Aetherion Analyst** — CSV/table stats and trend detection',
  '• **Aetherion Writer** — seeded stories and haiku',
  '• **Aetherion Core** (embedded) — the full Prime → Hermes → Metis agent pipeline, needs an internet connection for its provider mesh',
  'Pin any of them in the Chat sidebar, or call them via `/api/localmodels/chat`.',
];

export function generalAnswer(prompt: string): string {
  const t = prompt.trim();
  const lower = t.toLowerCase();

  // greetings / identity
  if (/^(hi|hello|hey|yo|good (morning|afternoon|evening))\b/.test(lower) && t.length < 40) {
    return 'Hello! I am **Aetherion Local** — the app’s own offline model, running entirely on your machine. Ask me to do math, analyze code, summarize text, crunch data, or tell a story. No API keys, no network.';
  }
  if (/(who are you|what are you|your name|introduce yourself)/.test(lower)) {
    return 'I am **Aetherion Local**, one of Aetherion’s own models. I run on-device with zero network calls — deterministic by design. My siblings (Math, Coder, Summarizer, Analyst, Writer) are one pin away in the chat sidebar.';
  }
  if (/(what can you do|capabilities|help\b)/.test(lower)) {
    return FAMILY_LINES.join('\n');
  }
  if (/thank/.test(lower)) return 'Anytime. That answer cost zero tokens and zero network — the own-model way.';

  // intent routing to the specialists
  const math = mathAnswer(t);
  if (math) return math;
  const code = codeAnswer(t);
  if (code) return code;
  const summary = summarizerAnswer(t);
  if (summary) return summary;
  const data = analystAnswer(t);
  if (data) return data;
  const story = writerAnswer(t);
  if (story) return story;

  if (/remember\s+(that\s+)?/i.test(t)) return 'I will store that in memory (the app extracts “remember …” automatically).';

  // honest fallback
  return [
    `**${t.slice(0, 90)}${t.length > 90 ? '…' : ''}**`,
    '',
    'I am Aetherion Local — a deterministic on-device model. I am genuinely good at math, code structure, summaries, tables and short fiction, but this prompt is beyond my local skill set.',
    '',
    'For a real LLM answer:',
    '• **Workspace → Aetheris** — delegate to the embedded core (Prime → Hermes → Metis) when the machine has internet access',
    '• **Settings → Providers** — connect Ollama for a real local model, or any OpenAI-compatible endpoint',
    '• **Chat sidebar** — pin Math / Coder / Summarizer / Analyst / Writer for their strengths',
  ].join('\n');
}
