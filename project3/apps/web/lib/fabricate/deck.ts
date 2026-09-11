// SUTRA Fabricate — deck outlines.
// Deterministic local template when offline; Puter AI gateway (or any
// injected chat function) when connected. The AI is asked for strict JSON,
// and every field is validated — a malformed reply can never crash the deck.

import type { Slide } from './pptx';
import { hashSeed, rngFrom } from './geometry';

const LOCAL_TEMPLATES: Array<{ title: string; bullets: string[] }> = [
  { title: 'Overview', bullets: ['What we are covering', 'Why it matters now', 'Expected outcomes'] },
  { title: 'Context & Problem', bullets: ['The situation today', 'What is broken or missing', 'Who it affects'] },
  { title: 'Approach', bullets: ['Core idea in one sentence', 'How it works, step by step', 'Key design choices'] },
  { title: 'Implementation', bullets: ['Milestones and phases', 'Tools and dependencies', 'Risks and mitigations'] },
  { title: 'Results & Impact', bullets: ['What success looks like', 'Measurable outcomes', 'Lessons learned'] },
  { title: 'Next Steps', bullets: ['Immediate actions', 'Owners and timelines', 'Open questions'] },
];

const TOPIC_VERBS: Record<string, string[]> = {
  default: ['shape', 'build', 'deliver', 'measure'],
  plan: ['plan', 'sequence', 'staff', 'track'],
  pitch: ['hook', 'prove', 'monetize', 'ask'],
  research: ['define', 'gather', 'analyze', 'conclude'],
  launch: ['position', 'announce', 'ship', 'measure'],
};

function verbsFor(topic: string): string[] {
  const p = topic.toLowerCase();
  if (/(plan|roadmap|strategy)/.test(p)) return TOPIC_VERBS.plan;
  if (/(pitch|fund|invest|startup)/.test(p)) return TOPIC_VERBS.pitch;
  if (/(research|study|paper|thesis)/.test(p)) return TOPIC_VERBS.research;
  if (/(launch|release|product|ship)/.test(p)) return TOPIC_VERBS.launch;
  return TOPIC_VERBS.default;
}

/** Deterministic, fully offline outline — always works. */
export function localOutline(topic: string): { title: string; slides: Slide[] } {
  const t = topic.trim().slice(0, 80);
  const rnd = rngFrom(hashSeed(topic.toLowerCase()));
  const verbs = verbsFor(topic);
  const title = t
    .split(/\s+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ')
    .slice(0, 60);
  const slides = LOCAL_TEMPLATES.map((tpl, i) => ({
    title: i === 0 ? title : tpl.title,
    bullets: tpl.bullets.map((b) => {
      const v = verbs[Math.min(verbs.length - 1, i)];
      if (i === 0) return `${v} ${t.toLowerCase()}`;
      if (i === 2) return `${v} the core of ${t.toLowerCase()}`;
      if (i === 4) return `What "${t.toLowerCase()}" delivers when it works`;
      return `${b} · ${t.toLowerCase().split(' ')[0] ?? 'scope'}`;
    }),
  }));
  // small deterministic shuffle of two middle slides keeps decks varied
  if (rnd() > 0.5) {
    const [a, b] = [slides[2], slides[3]];
    slides[2] = b;
    slides[3] = a;
  }
  return { title, slides };
}

export type DeckChat = (
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  options?: { model?: string; temperature?: number; maxTokens?: number },
) => Promise<{ content: string } | null>;

const SYSTEM = `You are a presentation architect. Reply with STRICT JSON only, no prose, no markdown fences:
{"title":"deck title","slides":[{"title":"slide title","bullets":["3-6 short bullet points each"]}]}
6 slides. Bullets must be short phrases (max 10 words).`;

/** AI outline via Puter (or injected chat fn); falls back to local. */
export async function aiOutline(
  topic: string,
  chat: DeckChat,
): Promise<{ title: string; slides: Slide[]; via: 'puter' | 'local' }> {
  const local = localOutline(topic);
  if (!chat) return { ...local, via: 'local' };
  try {
    const res = await chat([{ role: 'system', content: SYSTEM }, { role: 'user', content: topic }], {
      temperature: 0.7,
      maxTokens: 1600,
    });
    if (!res?.content) return { ...local, via: 'local' };
    const text = res.content.replace(/```(?:json)?/gi, '').trim();
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end <= start) return { ...local, via: 'local' };
    const parsed = JSON.parse(text.slice(start, end + 1)) as { title?: unknown; slides?: unknown };
    const slides = Array.isArray(parsed.slides)
      ? (parsed.slides as Array<{ title?: unknown; bullets?: unknown }>)
          .slice(0, 12)
          .map((s) => ({
            title: typeof s.title === 'string' && s.title.trim() ? s.title.trim().slice(0, 90) : 'Untitled',
            bullets: Array.isArray(s.bullets)
              ? s.bullets.filter((b): b is string => typeof b === 'string' && !!b.trim()).map((b) => b.trim().slice(0, 160)).slice(0, 8)
              : [],
          }))
          .filter((s) => s.bullets.length > 0)
      : [];
    if (slides.length < 2) return { ...local, via: 'local' };
    return {
      title: typeof parsed.title === 'string' && parsed.title.trim() ? parsed.title.trim().slice(0, 90) : local.title,
      slides,
      via: 'puter',
    };
  } catch {
    return { ...local, via: 'local' };
  }
}
