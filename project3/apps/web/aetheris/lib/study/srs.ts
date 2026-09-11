/**
 * Spaced repetition (SM-2 variant, as used by Anki) — pure functions, unit-tested.
 * Grades: 0 = again (forgot), 1 = hard, 2 = good, 3 = easy.
 */
export interface SrsState {
  /** Ease factor (≥ 1.3). */
  ease: number;
  /** Current interval in days (0 = new / learning). */
  interval: number;
  /** Consecutive successful reviews. */
  reps: number;
  /** Total lapses (forgot after having learned). */
  lapses: number;
  /** Epoch ms when next due. */
  due: number;
  lastReviewed?: number;
}

export type Grade = 0 | 1 | 2 | 3;
const DAY = 86_400_000;

export const newSrs = (now = Date.now()): SrsState => ({ ease: 2.5, interval: 0, reps: 0, lapses: 0, due: now });

/** Apply a review grade and return the new state. */
export function review(s: SrsState, grade: Grade, now = Date.now()): SrsState {
  let { ease, interval, reps, lapses } = s;
  if (grade === 0) {
    lapses += 1; reps = 0; interval = 0; ease = Math.max(1.3, ease - 0.2);
    return { ease, interval, reps, lapses, due: now + 10 * 60_000, lastReviewed: now }; // relearn in 10 min
  }
  // ease adjustment (SM-2): hard −0.15, good 0, easy +0.15
  ease = Math.max(1.3, ease + (grade === 1 ? -0.15 : grade === 3 ? 0.15 : 0));
  if (reps === 0) interval = grade === 1 ? 1 : grade === 2 ? 1 : 4;
  else if (reps === 1) interval = grade === 1 ? 3 : grade === 2 ? 6 : 10;
  else interval = Math.round(interval * ease * (grade === 1 ? 1.2 / ease : grade === 3 ? 1.3 : 1));
  interval = Math.max(1, Math.min(interval, 365));
  reps += 1;
  return { ease: Math.round(ease * 100) / 100, interval, reps, lapses, due: now + interval * DAY, lastReviewed: now };
}

export const isDue = (s: SrsState, now = Date.now()) => s.due <= now;

/** Stage label for the UI. */
export function stage(s: SrsState): "new" | "learning" | "young" | "mature" {
  if (s.reps === 0 && !s.lastReviewed) return "new";
  if (s.interval < 1) return "learning";
  return s.interval < 21 ? "young" : "mature";
}

/** Order a review queue: due cards first (most overdue), then new cards, capped. */
export function buildQueue<T extends { srs: SrsState }>(cards: T[], now = Date.now(), maxNew = 10, maxDue = 50): T[] {
  const due = cards.filter((c) => c.srs.lastReviewed && isDue(c.srs, now)).sort((a, b) => a.srs.due - b.srs.due).slice(0, maxDue);
  const fresh = cards.filter((c) => !c.srs.lastReviewed).slice(0, maxNew);
  return [...due, ...fresh];
}

/** Retention estimate: fraction of learned cards not lapsed recently, and streak-ish summary. */
export function deckStats<T extends { srs: SrsState }>(cards: T[], now = Date.now()) {
  const n = cards.length;
  const byStage = { new: 0, learning: 0, young: 0, mature: 0 };
  let due = 0, lapses = 0, reps = 0;
  for (const c of cards) { byStage[stage(c.srs)]++; if (c.srs.lastReviewed && isDue(c.srs, now)) due++; lapses += c.srs.lapses; reps += c.srs.reps; }
  const learned = n - byStage.new;
  const retention = reps + lapses ? Math.round((reps / (reps + lapses)) * 100) : null;
  return { total: n, due, learned, byStage, retention };
}
