import { store } from "@/aetheris/lib/store";
import { route } from "@/aetheris/lib/router/router";
import { agentById, HERMES_BASE, AGENTS } from "@/aetheris/lib/agents/catalog";
import type { ChatMessage } from "@/aetheris/lib/router/types";
import { newSrs, type SrsState, type Grade, review as srsReview } from "./srs";

export type CardKind = "flashcard" | "mcq" | "cloze" | "short";

export interface Card {
  id: string;
  kind: CardKind;
  /** Question / front. For cloze, the sentence with {{c1::answer}} markers. */
  front: string;
  /** Answer / back (or the correct option text for MCQ). */
  back: string;
  options?: string[];
  explanation?: string;
  difficulty: 1 | 2 | 3;
  tags: string[];
  srs: SrsState;
  createdAt: number;
}

export interface Deck {
  id: string;
  uid: string;
  title: string;
  subject: string;
  /** Free-text scope: syllabus, chapter, exam, notes summary. */
  scope: string;
  language: string;
  agent: string;
  cards: Card[];
  createdAt: number;
  updatedAt: number;
  history: { at: number; reviewed: number; correct: number }[];
}

export interface QuizResult { id: string; deckId: string; at: number; total: number; correct: number; perCard: { cardId: string; correct: boolean; answer: string }[] }

const COL = "study_decks";
const rid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export async function listDecks(uid: string): Promise<Deck[]> {
  return Object.values(await store.all<Deck>(COL)).filter((d) => d.uid === uid).sort((a, b) => b.updatedAt - a.updatedAt);
}
export const getDeck = (id: string) => store.get<Deck>(COL, id);
export async function createDeck(uid: string, input: { title?: string; subject: string; scope?: string; language?: string; agent?: string }): Promise<Deck> {
  const agent = pickAgent(input.subject, input.agent);
  const d: Deck = { id: rid(), uid, title: (input.title ?? input.subject).slice(0, 120), subject: input.subject.slice(0, 120), scope: (input.scope ?? "").slice(0, 4000), language: input.language ?? "English", agent, cards: [], createdAt: Date.now(), updatedAt: Date.now(), history: [] };
  await store.set(COL, d.id, d); return d;
}
export const deleteDeck = (id: string) => store.remove(COL, id);
export const saveDeck = async (d: Deck) => { d.updatedAt = Date.now(); await store.set(COL, d.id, d); return d; };

/** Route a subject to the most relevant tutor agent. */
export function pickAgent(subject: string, forced?: string): string {
  if (forced && agentById(forced)) return agentById(forced)!.id;
  const s = subject.toLowerCase();
  const map: [RegExp, string][] = [
    [/phys|mechanic|optic|electro/, "physics"], [/chem|organic|reaction/, "chemistry"], [/bio|anatomy|genetic|botany|zoology/, "biology"],
    [/math|algebra|calculus|geometry|trigonometry|statistic|probab/, "math"], [/histor|civics|polity|constitution/, "history"], [/econ/, "economics"],
    [/geograph|climate|map/, "geography"], [/tamil|தமிழ்/, "tamil"], [/hindi|हिंदी/, "hindi"], [/english|grammar|vocab|ielts|toefl/, "english"],
    [/spanish|french|german|japanese|korean|language/, "polyglot"], [/law|legal|ipc|contract/, "legal"], [/account|tax|gst|finance|cfa|ca /, "accountant"],
    [/code|program|python|java|javascript|dsa|algorithm|sql|system design/, "coder"], [/security|owasp|network/, "security"], [/data|ml|machine learning|statistics/, "ml"],
    [/medic|pharma|anatomy|neet/, "medinfo"], [/ai ethic|ethic/, "ai-ethics"], [/upsc|ssc|tnpsc|gate|exam/, "exam"], [/philosoph|logic/, "philosopher"],
  ];
  for (const [re, id] of map) if (re.test(s)) return id;
  return "tutor";
}

/** Parse a model reply into cards; tolerant of fences and trailing prose. */
export function parseCards(text: string, now = Date.now()): Card[] {
  const m = /\[[\s\S]*\]/.exec(text.replace(/```(?:json)?/g, ""));
  if (!m) return [];
  let arr: unknown;
  try { arr = JSON.parse(m[0]); } catch { return []; }
  if (!Array.isArray(arr)) return [];
  const out: Card[] = [];
  for (const raw of arr) {
    const r = raw as Record<string, unknown>;
    const kind = (["flashcard", "mcq", "cloze", "short"].includes(String(r.kind)) ? r.kind : "flashcard") as CardKind;
    const front = String(r.front ?? r.question ?? r.q ?? "").trim(); const back = String(r.back ?? r.answer ?? r.a ?? "").trim();
    if (!front || !back) continue;
    const options = Array.isArray(r.options) ? (r.options as unknown[]).map(String).filter(Boolean).slice(0, 6) : undefined;
    if (kind === "mcq" && (!options || options.length < 2 || !options.includes(back))) continue;
    const dRaw = Number(r.difficulty ?? 2); const difficulty = (dRaw >= 3 ? 3 : dRaw <= 1 ? 1 : 2) as 1 | 2 | 3;
    out.push({ id: rid(), kind, front: front.slice(0, 1000), back: back.slice(0, 1000), options, explanation: r.explanation ? String(r.explanation).slice(0, 1000) : undefined, difficulty, tags: Array.isArray(r.tags) ? (r.tags as unknown[]).map(String).slice(0, 5) : [], srs: newSrs(now), createdAt: now });
  }
  return out;
}

export function generationPrompt(d: Deck, opts: { count: number; kinds: CardKind[]; focus?: string; weak?: string[] }): ChatMessage[] {
  const spec = agentById(d.agent) ?? agentById("tutor")!;
  const existing = d.cards.slice(-40).map((c) => c.front).join(" | ");
  return [
    { role: "system", content: `${HERMES_BASE}\n\n${spec.system}\n\nYou are generating study cards. Output ONLY a JSON array (no prose) of ${opts.count} objects: {"kind":"flashcard|mcq|cloze|short","front":"...","back":"...","options":["..."] (mcq only, 4 options, back must equal the correct option verbatim),"explanation":"one or two sentences","difficulty":1|2|3,"tags":["..."]}. Kinds to use: ${opts.kinds.join(", ")}. Language: ${d.language}. Cards must be accurate, atomic (one fact/skill each), unambiguous, exam-relevant, and must not duplicate these existing fronts: ${existing || "(none)"}. Cloze format: sentence with the answer wrapped as {{c1::answer}} in "front" and the answer alone in "back". Mix difficulties (≈30/50/20).` },
    { role: "user", content: `Subject: ${d.subject}\nScope: ${d.scope || "general syllabus for this subject"}${opts.focus ? `\nFocus this batch on: ${opts.focus}` : ""}${opts.weak?.length ? `\nThe learner keeps failing these — add related cards that approach the same ideas differently:\n- ${opts.weak.join("\n- ")}` : ""}` },
  ];
}

/** Generate cards with the deck's tutor agent and append them. */
export async function generateCards(d: Deck, opts: { count?: number; kinds?: CardKind[]; focus?: string; adaptive?: boolean; allow?: string[]; allowKeyless?: boolean; signal?: AbortSignal }) {
  const count = Math.min(30, Math.max(3, opts.count ?? 12));
  const kinds = opts.kinds?.length ? opts.kinds : ["flashcard", "mcq", "cloze"];
  const weak = opts.adaptive ? d.cards.filter((c) => c.srs.lapses >= 2 || (c.srs.lastReviewed && c.srs.reps === 0)).slice(0, 8).map((c) => c.front) : [];
  const r = await route({ messages: generationPrompt(d, { count, kinds: kinds as CardKind[], focus: opts.focus, weak }), temperature: 0.5, maxTokens: 3000, allow: opts.allow, allowKeyless: opts.allowKeyless, signal: opts.signal });
  const cards = parseCards(r.content);
  if (!cards.length) throw new Error("The tutor returned no usable cards — try again or narrow the scope.");
  d.cards.push(...cards); await saveDeck(d);
  return { added: cards.length, cards, provider: r.provider };
}

export async function reviewCard(d: Deck, cardId: string, grade: Grade, now = Date.now()) {
  const c = d.cards.find((x) => x.id === cardId); if (!c) throw new Error("card not found");
  c.srs = srsReview(c.srs, grade, now);
  const today = new Date(now).setHours(0, 0, 0, 0);
  const h = d.history.find((x) => x.at === today);
  if (h) { h.reviewed++; if (grade > 0) h.correct++; } else d.history.push({ at: today, reviewed: 1, correct: grade > 0 ? 1 : 0 });
  await saveDeck(d); return c;
}

/** Grade a free-text answer for a short/flashcard card: exact/normalised match first, else ask the tutor. */
export async function gradeAnswer(d: Deck, card: Card, answer: string, opts: { allow?: string[]; allowKeyless?: boolean }): Promise<{ correct: boolean; feedback: string }> {
  const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  if (card.kind === "mcq" || card.kind === "cloze") return { correct: norm(answer) === norm(card.back), feedback: norm(answer) === norm(card.back) ? "Correct." : `The answer was: ${card.back}` };
  if (norm(answer) && norm(answer) === norm(card.back)) return { correct: true, feedback: "Correct." };
  const spec = agentById(d.agent) ?? agentById("tutor")!;
  const r = await route({ temperature: 0, maxTokens: 200, allow: opts.allow, allowKeyless: opts.allowKeyless, messages: [
    { role: "system", content: `${HERMES_BASE}\n\n${spec.system}\n\nYou grade a learner's short answer. Reply ONLY with JSON {"correct":true|false,"feedback":"≤30 words, kind, specific"}. Accept paraphrases and partial credit only if the essential idea is present.` },
    { role: "user", content: `Question: ${card.front}\nReference answer: ${card.back}\nLearner's answer: ${answer}` } ] });
  try { const j = JSON.parse(/\{[\s\S]*\}/.exec(r.content)?.[0] ?? "{}"); return { correct: !!j.correct, feedback: String(j.feedback ?? "") }; }
  catch { return { correct: false, feedback: `Reference answer: ${card.back}` }; }
}

export const STUDY_AGENTS = AGENTS.filter((a) => ["academy", "language", "coding", "legal", "finance", "health", "ethics"].includes(a.domain)).map((a) => ({ id: a.id, name: a.name, icon: a.icon }));
