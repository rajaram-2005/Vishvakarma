/**
 * Lumen own-model family — registry, dispatch and streaming.
 * Six models that run entirely on-device (browser or server), no keys,
 * no network, deterministic output. This module is isomorphic: the chat
 * page runs it client-side, the /api/localmodels routes run it server-side.
 */

import { mathAnswer } from './math';
import { codeAnswer } from './code';
import { summarizerAnswer } from './summarizer';
import { analystAnswer } from './analyst';
import { writerAnswer } from './writer';
import { generalAnswer } from './general';

export interface OwnModel {
  id: string;
  name: string;
  engine: 'aetherion-own';
  tagline: string;
  description: string;
  strengths: string[];
  sample: string;
  answer(prompt: string): string;
}

export const OWN_MODELS: OwnModel[] = [
  {
    id: 'aetherion-local',
    name: 'Lumen Local',
    engine: 'aetherion-own',
    tagline: 'the general own-model',
    description: 'Offline assistant with intent routing: small talk, identity, help — and it hands math, code, summaries, data and stories to the specialist own-models automatically.',
    strengths: ['small talk', 'intent routing', 'help', 'memory notes'],
    sample: 'What can you do?',
    answer: generalAnswer,
  },
  {
    id: 'aetherion-math',
    name: 'Lumen Math',
    engine: 'aetherion-own',
    tagline: 'computational model',
    description: 'A real shunting-yard expression evaluator plus a bisection/linear equation solver, statistics, primality, factorization, gcd/lcm, percentages and unit conversions.',
    strengths: ['evaluation', 'equations', 'stats', 'primes', 'conversions'],
    sample: '17 × 23 + 5',
    answer: mathAnswer,
  },
  {
    id: 'aetherion-coder',
    name: 'Lumen Coder',
    engine: 'aetherion-own',
    tagline: 'code-intelligence model',
    description: 'Structural code analysis (depth, TODOs, exports, imports), line-by-line walkthroughs and a deterministic snippet library — fizzbuzz, debounce, retry, flatten, binary search.',
    strengths: ['code analysis', 'walkthrough', 'snippets'],
    sample: 'Explain: function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); } }',
    answer: codeAnswer,
  },
  {
    id: 'aetherion-summarizer',
    name: 'Lumen Summarizer',
    engine: 'aetherion-own',
    tagline: 'extractive summarization',
    description: 'Frequency-weighted sentence scoring with stopword filtering — keeps the highest-ranked sentences in original order, as bullets or a paragraph, and reports the compression ratio.',
    strengths: ['summaries', 'key points', 'extractive', 'offline'],
    sample: 'Summarize: Lumen is a local-first AI workspace fused with the embedded Aetheris intelligence core. It runs models, agents, tools, knowledge and workflows in one place. Nothing requires a cloud account. The Aetheris core brings 393 capabilities on the same origin. Own models run fully offline.',
    answer: summarizerAnswer,
  },
  {
    id: 'aetherion-analyst',
    name: 'Lumen Analyst',
    engine: 'aetherion-own',
    tagline: 'tabular data analysis',
    description: 'Parses CSV/TSV/whitespace tables and number series — per-column mean/min/max, linear trend detection, mode frequency — and prints insights. Data never leaves the machine.',
    strengths: ['tables', 'csv', 'trends', 'stats'],
    sample: 'month,revenue\njan,1200\nfeb,1450\nmar,1600\napr,2100',
    answer: analystAnswer,
  },
  {
    id: 'aetherion-writer',
    name: 'Lumen Writer',
    engine: 'aetherion-own',
    tagline: 'seeded creative model',
    description: 'Deterministic short fiction and haiku: FNV-1a-seeded generation over sci-fi, fantasy and noir banks — the same prompt always produces the same piece.',
    strengths: ['stories', 'haiku', 'deterministic', 'offline'],
    sample: 'Write a story about a lonely space station',
    answer: writerAnswer,
  },
];

export function localModelById(id?: string | null): OwnModel | undefined {
  return OWN_MODELS.find((m) => m.id === id);
}

export interface LocalModelResult {
  content: string;
  modelId: string;
  modelName: string;
  engine: 'aetherion-own';
  offline: true;
}

export function runLocalModel(id: string, prompt: string): LocalModelResult {
  const model = localModelById(id) ?? OWN_MODELS[0];
  const content = model.answer(prompt);
  return { content, modelId: model.id, modelName: model.name, engine: 'aetherion-own', offline: true };
}

/** Chunk a reply into ~56-char pieces at word boundaries (for SSE streaming). */
function chunkText(text: string, size = 56): string[] {
  if (text.length <= size) return [text];
  const out: string[] = [];
  let rest = text;
  while (rest.length > size) {
    let cut = rest.lastIndexOf(' ', size);
    if (cut <= size / 2) cut = size;
    out.push(rest.slice(0, cut + 1));
    rest = rest.slice(cut + 1);
  }
  if (rest) out.push(rest);
  return out;
}

/** Async generator used by /api/localmodels/chat to emit SSE delta chunks. */
export async function* streamLocalModel(id: string, prompt: string): AsyncGenerator<string> {
  const { content } = runLocalModel(id, prompt);
  const pieces = chunkText(content);
  for (let i = 0; i < pieces.length; i++) {
    yield pieces[i];
    // small delay so the client sees genuine streaming
    await new Promise((r) => setTimeout(r, 24));
  }
}
