/**
 * Real arena statistical tests.
 *
 *   Pairwise comparison between two arena rows (typically
 *   from the same provider across runs, or two providers on
 *   the same prompt). The function returns:
 *     - jaccard:  |tokens(a) ∩ tokens(b)| / |tokens(a) ∪ tokens(b)|
 *     - lengthRatio: max(|a|,|b|) / min(|a|,|b|)
 *     - latencyRatio: max(la,lb) / min(la,lb)
 *     - latencyDeltaMs: la - lb
 *     - bothOk:  both rows are status=ok
 *     - winner:  a string label (a / b / tie / both-fail) plus
 *                a confidence note
 *
 *   The function is honest: it never claims a winner when
 *   either row is not 'ok'. It is pure: no model calls, no
 *   network. Tested with synthetic rows.
 */

import type { ArenaRow } from "@/aetheris/core/arena/compare";

export type Winner = "a" | "b" | "tie" | "both-fail";

export interface ArenaPairwise {
  a: { id: string; ok: boolean; content: string | null; latencyMs: number };
  b: { id: string; ok: boolean; content: string | null; latencyMs: number };
  jaccard: number | null;
  lengthRatio: number;
  lengthDeltaChars: number;
  latencyRatio: number;
  latencyDeltaMs: number;
  bothOk: boolean;
  winner: Winner;
  confidence: "ok" | "low";
  reason: string;
}

const STOPWORDS = new Set(["the", "a", "an", "is", "are", "and", "or", "of", "to", "in", "on", "at", "for", "with", "by", "this", "that", "it", "as", "be", "from"]);

function tokenise(s: string): string[] {
  return s.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

function jaccard(a: string, b: string): number {
  const A = new Set(tokenise(a));
  const B = new Set(tokenise(b));
  if (A.size === 0 && B.size === 0) return 1;
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  const union = A.size + B.size - inter;
  return union > 0 ? inter / union : 0;
}

export function compareArena(a: ArenaRow, b: ArenaRow): ArenaPairwise {
  const aContent = a.content ?? "";
  const bContent = b.content ?? "";
  const lenA = aContent.length;
  const lenB = bContent.length;
  const lengthRatio = Math.max(lenA, lenB) > 0 ? Math.max(lenA, lenB) / Math.max(1, Math.min(lenA, lenB)) : 1;
  const lengthDeltaChars = lenA - lenB;
  const la = a.latencyMs || 0;
  const lb = b.latencyMs || 0;
  const latencyRatio = Math.max(la, lb) > 0 ? Math.max(la, lb) / Math.max(1, Math.min(la, lb)) : 1;
  const latencyDeltaMs = la - lb;
  const bothOk = a.status === "ok" && b.status === "ok";
  const jac = bothOk && aContent && bContent ? jaccard(aContent, bContent) : null;
  let winner: Winner;
  let reason: string;
  let confidence: "ok" | "low" = "ok";
  if (!bothOk) {
    winner = "both-fail";
    reason = `at least one row is not ok: a=${a.status}, b=${b.status}`;
  } else if (jac !== null && jac >= 0.85) {
    winner = "tie";
    reason = `high token overlap (jaccard=${jac.toFixed(2)})`;
  } else {
    // Pick the lower-latency, non-error row.
    if (la < lb) { winner = "a"; reason = `a is faster by ${latencyDeltaMs}ms`; }
    else if (lb < la) { winner = "b"; reason = `b is faster by ${-latencyDeltaMs}ms`; }
    else { winner = "tie"; reason = "same latency"; }
    if (jac !== null && jac < 0.3) confidence = "low";
  }
  return {
    a: { id: a.providerId, ok: a.status === "ok", content: aContent, latencyMs: la },
    b: { id: b.providerId, ok: b.status === "ok", content: bContent, latencyMs: lb },
    jaccard: jac,
    lengthRatio,
    lengthDeltaChars,
    latencyRatio,
    latencyDeltaMs,
    bothOk,
    winner,
    confidence,
    reason,
  };
}
