/**
 * Operator Handoff Notes.
 *
 *   A small, typed store for the oncoming operator to read
 *   what the previous shift decided and to leave notes for the
 *   next shift. Backed by the production `handoff-notes`
 *   collection, keyed by `twinId`.
 *
 *   Each note has: id, twinId, uid, author, at (ms), kind
 *   (observation | decision | open_question | escalation), text
 *   (≤ 2000 chars), and an optional `acked` flag.
 */

import { store } from "@/aetheris/lib/store";

export type HandoffKind = "observation" | "decision" | "open_question" | "escalation";

export const HANDOFF_KINDS: { kind: HandoffKind; label: string; description: string; colour: string }[] = [
  { kind: "observation", label: "Observation", description: "What the operator saw on the asset.", colour: "#38bdf8" },
  { kind: "decision", label: "Decision", description: "What the operator decided to do (or not do) and why.", colour: "#4ade80" },
  { kind: "open_question", label: "Open question", description: "An unresolved question for the oncoming shift.", colour: "#facc15" },
  { kind: "escalation", label: "Escalation", description: "An issue that was escalated to engineering / management.", colour: "#f87171" },
];

export interface HandoffNote {
  id: string;
  twinId: string;
  uid: string;
  author: string;
  at: number;
  kind: HandoffKind;
  text: string;
  acked: boolean;
}

const COLLECTION = "handoff-notes";

export async function listHandoff(twinId: string, opts: { uid?: string; limit?: number } = {}): Promise<HandoffNote[]> {
  const all = await store.all<HandoffNote>(COLLECTION);
  const out: HandoffNote[] = [];
  for (const [, v] of Object.entries(all)) {
    if (v.twinId !== twinId) continue;
    if (opts.uid && v.uid !== opts.uid) continue;
    out.push(v);
  }
  out.sort((a, b) => b.at - a.at);
  return out.slice(0, opts.limit ?? 50);
}

export async function postHandoff(opts: { twinId: string; uid: string; author: string; kind: HandoffKind; text: string }): Promise<HandoffNote> {
  if (!HANDOFF_KINDS.some((k) => k.kind === opts.kind)) throw new Error(`invalid kind: ${opts.kind}`);
  const text = opts.text.slice(0, 2000);
  const note: HandoffNote = {
    id: `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    twinId: opts.twinId,
    uid: opts.uid,
    author: opts.author.slice(0, 60),
    at: Date.now(),
    kind: opts.kind,
    text,
    acked: false,
  };
  await store.set(COLLECTION, note.id, note);
  return note;
}

export async function ackHandoff(id: string): Promise<HandoffNote | null> {
  const note = await store.get<HandoffNote>(COLLECTION, id);
  if (!note) return null;
  note.acked = true;
  await store.set(COLLECTION, id, note);
  return note;
}

export function kindMeta(kind: HandoffKind): { label: string; colour: string; description: string } {
  const def = HANDOFF_KINDS.find((k) => k.kind === kind)!;
  return { label: def.label, colour: def.colour, description: def.description };
}
