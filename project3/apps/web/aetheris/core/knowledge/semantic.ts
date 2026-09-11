/**
 * Offline semantic embeddings — Random Indexing over the corpus (Sahlgren 2005).
 *
 * The knowledge fabric's built-in embedder is a hashed n-gram: deterministic and language-agnostic,
 * but purely *lexical* — "kitten" and "cat" share no characters, so their vectors are unrelated.
 * Real semantic vectors normally mean calling an embedding provider (`EMBEDDINGS_URL`) or shipping a
 * neural model, and neither is possible offline with no download.
 *
 * Random Indexing is the classic way to get distributional semantics without either. Every word gets
 * a fixed, sparse, deterministic random *index* vector. Each time a word appears, the index vectors
 * of the words around it are accumulated into its *context* vector. Words that occur in similar
 * contexts end up with similar context vectors — "kitten" and "cat" both sit next to "the", "small",
 * "fur", "purring", so they converge, while "database" does not. That is the distributional
 * hypothesis, computed in-process, with no network and no model file.
 *
 * It is honest about its limits: it only knows what the corpus taught it. `stats()` reports how much
 * has been learned, and words with no learned vector fall back to their random index, which is
 * lexical rather than semantic. Vectors from this model are NOT comparable with hashed n-gram
 * vectors, so the fabric tags every stored vector with its space and only compares like with like.
 *
 * Everything here is pure — the fabric owns persistence.
 */
import { createHash } from "node:crypto";

export const SEMANTIC_DIM = 256;
/** Non-zero entries per index vector. Sparse keeps accumulation cheap and the geometry well spread. */
const SPARSITY = 8;
/** Context window in tokens either side of the target word. */
const WINDOW = 3;

export interface SemanticModel {
  dim: number;
  /** Accumulated context vector per word. */
  contexts: Map<string, Float32Array>;
  /** How many times each word was seen (used to damp very frequent words). */
  counts: Map<string, number>;
  /** Number of documents/sentences the model has learned from. */
  learnedFrom: number;
}

export const createModel = (dim = SEMANTIC_DIM): SemanticModel => ({ dim, contexts: new Map(), counts: new Map(), learnedFrom: 0 });

export const tokenize = (s: string): string[] => s.toLowerCase().normalize("NFKC").match(/[\p{L}\p{N}]+/gu) ?? [];

/** Words that carry no topical signal. Skipped as *context*, never as targets. */
const STOP = new Set([
  "the","a","an","and","or","but","if","then","than","of","to","in","on","at","by","for","with","from","as","is","are","was","were","be","been","being",
  "this","that","these","those","it","its","into","onto","over","under","again","further","once","here","there","when","where","why","how","all","any",
  "both","each","few","more","most","other","some","such","no","nor","not","only","own","same","so","too","very","can","will","just","should","now","do","does","did","doing","have","has","had","having","i","you","he","she","we","they","them","his","her","our","their","my","your","me","him","us","what","which","who","whom","because","while","about","against","up","down","out","off","also","would","could","shall","may","might","must","am",
]);

/**
 * Deterministic sparse index vector for a word: `SPARSITY` non-zeros at ±1, positions and signs
 * derived from the word's hash. Deterministic matters — the same word must get the same vector in
 * every process, or learned context vectors would not be comparable across restarts.
 */
export function randomIndex(word: string, dim = SEMANTIC_DIM): Float32Array {
  const v = new Float32Array(dim);
  const h = createHash("sha256").update(`ri:${word}`).digest();
  for (let i = 0; i < SPARSITY; i++) {
    // 4 bytes per slot → a well-spread position; the low bit of the byte after the slot gives the
    // sign. `% 28` keeps readUInt32BE inside the 32-byte digest.
    const o = (i * 5) % 28;
    const pos = (h.readUInt32BE(o) >>> 0) % dim;
    v[pos] += h[o + 4] & 1 ? 1 : -1;
  }
  return v;
}

const norm = (v: Float32Array): Float32Array => {
  let n = 0;
  for (const x of v) n += x * x;
  n = Math.sqrt(n) || 1;
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i] / n;
  return out;
};

/**
 * Teach the model one document (a fact, a sentence — anything coherent). Returns the number of
 * content words whose context vector changed.
 */
export function learn(model: SemanticModel, text: string): number {
  const t = tokenize(text).filter((w) => w.length > 1);
  if (!t.length) return 0;
  let touched = 0;
  for (let i = 0; i < t.length; i++) {
    const target = t[i];
    if (STOP.has(target)) continue;
    let cv = model.contexts.get(target);
    if (!cv) { cv = new Float32Array(model.dim); model.contexts.set(target, cv); }
    for (let d = 1; d <= WINDOW; d++) {
      const w = 1 / d; // nearer context counts for more
      for (const j of [i - d, i + d]) {
        if (j < 0 || j >= t.length) continue;
        const ctx = t[j];
        if (ctx === target || STOP.has(ctx)) continue;
        const ri = randomIndex(ctx, model.dim);
        for (let k = 0; k < model.dim; k++) cv[k] += ri[k] * w;
      }
    }
    model.counts.set(target, (model.counts.get(target) ?? 0) + 1);
    touched++;
  }
  model.learnedFrom++;
  return touched;
}

/**
 * Embed a phrase: the mean of its words' learned context vectors, falling back to the word's random
 * index when the corpus has not taught it. Returned L2-normalised, so cosine is a dot product.
 */
export function vector(model: SemanticModel, text: string): Float32Array {
  const t = tokenize(text).filter((w) => w.length > 1);
  const out = new Float32Array(model.dim);
  if (!t.length) return out;
  let used = 0;
  for (const w of t) {
    const cv = model.contexts.get(w);
    const src = cv ?? randomIndex(w, model.dim);
    // Damp very frequent words a little so they do not dominate a long phrase.
    const damp = cv ? 1 / Math.log2(2 + (model.counts.get(w) ?? 1)) : 0.5;
    for (let i = 0; i < model.dim; i++) out[i] += src[i] * damp;
    used++;
  }
  for (let i = 0; i < model.dim; i++) out[i] /= used;
  return norm(out);
}

/** How much the corpus has actually taught the model — reported, never implied. */
export function stats(model: SemanticModel) {
  let min = Infinity;
  let max = 0;
  for (const n of model.counts.values()) { if (n < min) min = n; if (n > max) max = n; }
  return {
    words: model.contexts.size,
    learnedFrom: model.learnedFrom,
    dim: model.dim,
    rarest: Number.isFinite(min) ? min : 0,
    mostFrequent: max,
    kind: "random-indexing (distributional, corpus-trained, offline)" as const,
  };
}

export function serialize(model: SemanticModel): string {
  return JSON.stringify({
    dim: model.dim,
    learnedFrom: model.learnedFrom,
    // Array.from on a Float32Array round-trips exactly through JSON for these magnitudes.
    words: [...model.contexts.entries()].map(([w, v]) => [w, Array.from(v), model.counts.get(w) ?? 0] as [string, number[], number]),
  });
}

export function deserialize(raw: string): SemanticModel {
  const model = createModel();
  try {
    const j = JSON.parse(raw) as { dim?: number; learnedFrom?: number; words?: [string, number[], number][] };
    if (!Array.isArray(j.words)) return model;
    model.dim = j.dim ?? SEMANTIC_DIM;
    model.learnedFrom = j.learnedFrom ?? 0;
    for (const [w, v, n] of j.words) {
      const cv = new Float32Array(model.dim);
      for (let i = 0; i < model.dim && i < v.length; i++) cv[i] = v[i];
      model.contexts.set(w, cv);
      model.counts.set(w, n);
    }
  } catch { /* a corrupt blob must not take the fabric down */ }
  return model;
}

export const cosine = (a: Float32Array, b: Float32Array) => {
  let s = 0;
  for (let i = 0; i < a.length && i < b.length; i++) s += a[i] * b[i];
  return s;
};
