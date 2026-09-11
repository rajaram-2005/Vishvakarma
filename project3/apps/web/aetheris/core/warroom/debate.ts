/**
 * War Room — extractable, testable debate engine.
 *
 * Why extract: the existing /api/debate used to be one giant inline route
 * handler. The motion+transcript+verdict flow is a real, testable piece of
 * logic that deserves to be importable from tests, scripts, and any other
 * UI surface (a "war room" tab inside the Arena, a CLI, etc.).
 *
 * What it is:
 *   runDebate({ motion, rounds, pro, con, ... }) yields a Transcript with
 *   one Turn per side per round, then a Verdict from the judge agent. The
 *   turn ordering is deterministic; each turn records the agent id, the
 *   system prompt that was used, the messages sent, and the response text.
 *   That's the audit trail the War Room needs to be a real tool, not a
 *   magic eight-ball.
 *
 * What it is NOT:
 *   - Not a multi-agent debate tournament. It's one motion, two sides, one
 *     judge, N rounds. That's the design that fits in a chat.
 *   - Not a real-time stockade. The streaming happens through the
 *     caller's onDelta hook; the engine itself is a normal async iterator.
 *   - Not a substitute for fact-checking. The judge agent scores the
 *     transcript; it doesn't independently verify the underlying claims.
 */

import { agentById, HERMES_BASE, METIS_BASE } from "@/aetheris/lib/agents/catalog";
import { route } from "@/aetheris/lib/router/router";
import type { ChatMessage } from "@/aetheris/lib/router/types";

export interface WarRoomTurn {
  /** Side of the argument this turn is on. */
  side: "pro" | "con" | "judge";
  /** 1-indexed round number. Judge's turn = rounds + 1. */
  round: number;
  /** Agent id from the catalog. */
  agent: string;
  /** Display name. */
  name: string;
  /** Emoji icon for the UI. */
  icon: string;
  /** System prompt that was sent. Always recorded for auditability. */
  systemPrompt: string;
  /** Messages that were sent to the model (system + user). */
  messages: ChatMessage[];
  /** Model's reply. */
  text: string;
  /** Provider that was actually used (or "synthetic" if no provider was reachable). */
  provider: string;
  /** Model id. */
  model: string;
  /** Wall-clock when the turn started (ms). */
  tMs: number;
  /** Wall-clock when the turn ended (ms). */
  endedAt: number;
}

export interface WarRoomDebate {
  /** Stable id (caller decides; usually a uuid). */
  id: string;
  /** Motion / question being debated. */
  motion: string;
  /** Proponent agent id. */
  pro: string;
  /** Opponent agent id. */
  con: string;
  /** Judge agent id (default "metis"). */
  judge: string;
  /** Number of back-and-forth rounds. */
  rounds: number;
  /** Ordered turns, one per speaking slot. */
  turns: WarRoomTurn[];
  /** When the debate was created (ms). */
  createdAt: number;
  /** When the debate finished (ms). */
  finishedAt: number;
  /** Total turns, for quick display. */
  totalTurns: number;
}

export interface RunDebateOptions {
  motion: string;
  pro?: string;
  con?: string;
  judge?: string;
  rounds?: number;
  /** Routing hint forwarded to the LLM mesh. */
  preferred?: string;
  /** Provider allow list (will be merged with the tier's allow list by the caller). */
  allow?: string[];
  /** Allow keyless providers? */
  allowKeyless?: boolean;
  /** Max tokens per turn. */
  maxTokens?: number;
  /** External abort signal. */
  signal?: AbortSignal;
  /**
   * Optional delta hook so the caller can stream each turn's text as it
   * arrives. The engine still returns the full text in `turns[i].text`.
   */
  onDelta?: (turn: { side: "pro" | "con" | "judge"; round: number; text: string }) => void;
  /**
   * If no provider can be reached, fall back to a deterministic local
   * reply (built from the motion + a small template) so the caller
   * always gets a usable transcript. Default true.
   */
  allowSyntheticFallback?: boolean;
  /** Stable id for the resulting debate. */
  id?: string;
  /** createdAt override (for determinism in tests). */
  createdAt?: number;
}

const MAX_ROUNDS = 4;
const MIN_ROUNDS = 1;
const MAX_MOTION = 2000;
const MAX_TURN_WORDS = 180;
const DEFAULT_JUDGE = "metis";
const DEFAULT_PRO = "strategist";
const DEFAULT_CON = "decision";

function clipMotion(s: string): string {
  return s.trim().slice(0, MAX_MOTION);
}

function clampRounds(n: number | undefined): number {
  const v = Math.floor(Number(n ?? 2));
  if (Number.isNaN(v) || v < MIN_ROUNDS) return 2;
  if (v > MAX_ROUNDS) return MAX_ROUNDS;
  return v;
}

function speakerSystemPrompt(side: "pro" | "con", spec: { name: string; system: string }, motion: string, round: number, rounds: number): string {
  return `${HERMES_BASE}\n\n${spec.system}\n\nYou are debating. Motion: "${motion}". You argue ${side === "pro" ? "FOR" : "AGAINST"} the motion. Round ${round} of ${rounds}. ${round === 1 ? "Open with your 3 strongest arguments." : "Rebut the other side's latest points specifically, then add one new argument."} Max ${MAX_TURN_WORDS} words. No pleasantries.`;
}

function judgeSystemPrompt(): string {
  return `${HERMES_BASE}\n\n${METIS_BASE}\n\nYou are the impartial adjudicator. Score each side 1–10 on evidence, logic, rebuttal and clarity in a Markdown table, name the winner with a one-paragraph reason, list the 3 strongest points overall, and give the reader a balanced bottom line for the motion.`;
}

function formatTranscript(transcript: WarRoomTurn[]): string {
  return transcript
    .filter((t) => t.side !== "judge")
    .map((t) => `[${t.side.toUpperCase()} · ${t.name}] ${t.text}`)
    .join("\n\n");
}

function syntheticReply(side: "pro" | "con" | "judge", motion: string, round: number, totalRounds: number): string {
  if (side === "judge") {
    return [
      "| Side | Evidence | Logic | Rebuttal | Clarity |",
      "| --- | --- | --- | --- | --- |",
      "| FOR | 6/10 | 7/10 | 6/10 | 7/10 |",
      "| AGAINST | 6/10 | 6/10 | 6/10 | 6/10 |",
      "",
      `**Result:** A draw. Both sides made comparable arguments on the motion "${motion}". Without independent verification, this debate cannot break the tie.`,
      "",
      "**Top 3 points overall**",
      `1. (FOR, round ${round - 1 || 1}) strongest FOR argument.`,
      `2. (AGAINST, round ${round - 1 || 1}) strongest AGAINST argument.`,
      "3. The framing of the motion itself deserves scrutiny before committing to a side.",
      "",
      `**Bottom line:** Treat the motion as a hypothesis. The transcript is a structured argument, not a verdict — re-check the underlying claims before acting.`,
    ].join("\n");
  }
  const phrase = side === "pro" ? "in favour of" : "against";
  return [
    `**Round ${round} of ${totalRounds} — ${side === "pro" ? "FOR" : "AGAINST"}**`,
    "",
    `1. The first strong argument ${phrase} the motion "${motion}" is a question of framing: what would count as evidence either way?`,
    `2. Second, the practical cost of being wrong is asymmetric and deserves an explicit weighting.`,
    `3. Third, the strongest counter-position is itself a hypothesis — it survives only if a key assumption holds.`,
    "",
    `*(Synthetic fallback reply — no LLM provider was reachable. Treat the structure, not the content, as the artefact.)*`,
  ].join("\n");
}

/** Run a full debate. Returns the completed debate with the full transcript. */
export async function runDebate(opts: RunDebateOptions): Promise<WarRoomDebate> {
  const motion = clipMotion(opts.motion ?? "");
  if (!motion) throw new Error("motion required");
  const rounds = clampRounds(opts.rounds);
  const proSpec = agentById(opts.pro ?? DEFAULT_PRO) ?? agentById(DEFAULT_PRO)!;
  const conSpec = agentById(opts.con ?? DEFAULT_CON) ?? agentById(DEFAULT_CON)!;
  const judgeSpec = agentById(opts.judge ?? DEFAULT_JUDGE) ?? agentById(DEFAULT_JUDGE)!;
  const fallback = opts.allowSyntheticFallback !== false;
  const id = opts.id ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const createdAt = opts.createdAt ?? Date.now();

  const pol: { allow?: string[]; allowKeyless?: boolean; maxTokens?: number; preferred?: string; signal?: AbortSignal } = {
    maxTokens: opts.maxTokens,
    signal: opts.signal,
  };
  if (opts.preferred) pol.preferred = opts.preferred;
  if (opts.allow) pol.allow = opts.allow;
  if (typeof opts.allowKeyless === "boolean") pol.allowKeyless = opts.allowKeyless;

  const turns: WarRoomTurn[] = [];
  const t0 = createdAt;

  const speak = async (side: "pro" | "con", round: number) => {
    const spec = side === "pro" ? proSpec : conSpec;
    const sys = speakerSystemPrompt(side, spec, motion, round, rounds);
    const prior = formatTranscript(turns);
    const msgs: ChatMessage[] = [
      { role: "system", content: sys },
      { role: "user", content: prior ? `Transcript so far:\n${prior}\n\nYour turn.` : "Begin." },
    ];
    const tMs = Date.now();
    let text = "";
    let provider = "synthetic";
    let model = "synthetic-fallback";
    if (!fallback || !await tryRoute({ ...pol, messages: msgs, temperature: 0.6, onDelta: (d) => { text += d; opts.onDelta?.({ side, round, text: d }); } }).then((r) => { text = r.content; provider = r.provider; model = r.model; return r.ok; }).catch(() => false)) {
      text = syntheticReply(side, motion, round, rounds);
      provider = "synthetic";
      model = "synthetic-fallback";
      // Mirror the delta for callers that want stream semantics.
      for (const line of text.split(/(?<=\n)/)) {
        opts.onDelta?.({ side, round, text: line });
      }
    }
    turns.push({
      side,
      round,
      agent: spec.id,
      name: spec.name,
      icon: spec.icon,
      systemPrompt: sys,
      messages: msgs,
      text,
      provider,
      model,
      tMs,
      endedAt: Date.now(),
    });
  };

  for (let round = 1; round <= rounds; round++) {
    await speak("pro", round);
    await speak("con", round);
  }

  // Judge
  {
    const sys = judgeSystemPrompt();
    const prior = formatTranscript(turns);
    const judgeMsgs: ChatMessage[] = [
      { role: "system", content: sys },
      { role: "user", content: `Motion: ${motion}\n\nTranscript:\n${prior}` },
    ];
    const tMs = Date.now();
    let text = "";
    let provider = "synthetic";
    let model = "synthetic-fallback";
    const ok = await tryRoute({ ...pol, messages: judgeMsgs, temperature: 0.2, onDelta: (d) => { text += d; opts.onDelta?.({ side: "judge", round: rounds + 1, text: d }); } }).then((r) => { text = r.content; provider = r.provider; model = r.model; return r.ok; }).catch(() => false);
    if (!ok) {
      text = syntheticReply("judge", motion, rounds + 1, rounds);
      provider = "synthetic";
      model = "synthetic-fallback";
      for (const line of text.split(/(?<=\n)/)) {
        opts.onDelta?.({ side: "judge", round: rounds + 1, text: line });
      }
    }
    turns.push({
      side: "judge",
      round: rounds + 1,
      agent: judgeSpec.id,
      name: judgeSpec.name,
      icon: judgeSpec.icon,
      systemPrompt: sys,
      messages: judgeMsgs,
      text,
      provider,
      model,
      tMs,
      endedAt: Date.now(),
    });
  }

  return {
    id,
    motion,
    pro: proSpec.id,
    con: conSpec.id,
    judge: judgeSpec.id,
    rounds,
    turns,
    createdAt: t0,
    finishedAt: Date.now(),
    totalTurns: turns.length,
  };
}

/**
 * Wrap the router so we can fall back gracefully if the LLM mesh has no
 * usable provider. Returns { ok, content, provider, model }.
 */
async function tryRoute(opts: Parameters<typeof route>[0]): Promise<{ ok: boolean; content: string; provider: string; model: string }> {
  try {
    const r = await route(opts);
    return { ok: true, content: r.content || "", provider: r.provider, model: r.model };
  } catch {
    return { ok: false, content: "", provider: "synthetic", model: "synthetic-fallback" };
  }
}
