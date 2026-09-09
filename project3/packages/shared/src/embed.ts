// SUTRA — local vector math.
// Deterministic hashed embeddings (offline, provider-neutral) plus BM25
// re-ranking and document chunking. Any neural embedding provider can be
// swapped in behind the same Float32Array interface.

export const EMBED_DIM = 384;

export function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9_]+/g) ?? [];
}

export function fnv1a(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function shortHash(s: string): string {
  return fnv1a(s).toString(16).padStart(8, '0').slice(0, 7);
}

export function embed(text: string, dim: number = EMBED_DIM): Float32Array {
  const v = new Float32Array(dim);
  const toks = tokenize(text);
  const grams = new Set<string>();
  for (const t of toks) {
    grams.add(t);
    if (t.length > 3) grams.add(t.slice(0, 3)); // light sublinear features
  }
  for (const g of grams) {
    const h = fnv1a(g);
    const idx = h % dim;
    const sign = h & 0x40000000 ? 1 : -1;
    v[idx] += sign;
  }
  return normalize(v);
}

export function normalize(v: Float32Array): Float32Array {
  let n = 0;
  for (let i = 0; i < v.length; i++) n += v[i] * v[i];
  n = Math.sqrt(n) || 1;
  const o = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) o[i] = v[i] / n;
  return o;
}

export function cosine(a: Float32Array, b: Float32Array): number {
  const n = Math.min(a.length, b.length);
  let s = 0;
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}

/** Lightweight BM25 index over a document corpus. */
export class BM25 {
  private df = new Map<string, number>();
  private docs: string[][] = [];
  private idf = new Map<string, number>();
  private avgdl = 0;

  constructor(texts: string[]) {
    this.docs = texts.map(tokenize);
    const N = texts.length || 1;
    for (const d of this.docs) {
      for (const t of new Set(d)) this.df.set(t, (this.df.get(t) ?? 0) + 1);
    }
    this.avgdl = this.docs.reduce((a, d) => a + d.length, 0) / N;
    for (const [t, f] of this.df) this.idf.set(t, Math.log(1 + (N - f + 0.5) / (f + 0.5)));
  }

  score(query: string, docIdx: number): number {
    const q = tokenize(query);
    const d = this.docs[docIdx] ?? [];
    if (!d.length) return 0;
    const tf = new Map<string, number>();
    for (const t of d) tf.set(t, (tf.get(t) ?? 0) + 1);
    let s = 0;
    for (const t of new Set(q)) {
      const f = tf.get(t) ?? 0;
      if (!f) continue;
      s += (this.idf.get(t) ?? 0) * (f * 1.2) / (f + 1.2 * (0.75 + 0.25 * (d.length / (this.avgdl || 1))));
    }
    return s;
  }
}

export interface Chunk {
  id: string;
  docId: string;
  heading: string;
  text: string;
}

/** Paragraph-aware chunker with overlap. */
export function chunkText(text: string, docId: string, size = 420, overlap = 90): Chunk[] {
  const out: Chunk[] = [];
  const paras = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  let buf = '';
  let heading = docId;
  const push = () => {
    if (buf.trim()) out.push({ id: `${docId}::c${out.length}`, docId, heading, text: buf.trim() });
  };
  for (const p of paras) {
    const h = p.split('\n', 1)[0].replace(/^#+\s*/, '').slice(0, 80);
    if (buf && buf.length + p.length > size) {
      push();
      buf = buf.slice(-Math.max(0, overlap));
    }
    buf = buf ? `${buf}\n\n${p}` : p;
    heading = h;
  }
  push();
  if (!out.length) out.push({ id: `${docId}::c0`, docId, heading: docId, text: text.slice(0, size) });
  return out;
}
