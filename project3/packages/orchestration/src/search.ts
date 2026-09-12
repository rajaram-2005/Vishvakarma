// §48 — Search Engine: semantic + keyword + metadata across the capability
// graph and knowledge. Reuses the local hashed embeddings from @sutra/shared.

import { embed, cosine, tokenize } from '@sutra/shared';

export interface SearchDoc {
  id: string;
  kind: string; // capability | model | bot | plugin | mcp | project | knowledge
  title: string;
  text: string;
  tags?: string[];
  metadata?: Record<string, string>;
}

export type MatchKind = 'semantic' | 'keyword' | 'metadata';

export interface SearchHit {
  doc: SearchDoc;
  kind: MatchKind;
  score: number;
}

export class SearchEngine {
  private docs: SearchDoc[] = [];
  private vectors = new Map<string, Float32Array>();

  index(doc: SearchDoc): void {
    this.docs.push(doc);
    this.vectors.set(doc.id, embed(`${doc.title} ${doc.tags?.join(' ') ?? ''} ${doc.text}`));
  }

  indexMany(docs: SearchDoc[]): void {
    for (const d of docs) this.index(d);
  }

  /** Combined semantic + keyword + metadata ranking. */
  search(query: string, limit = 20): SearchHit[] {
    const qv = embed(query);
    const qToks = new Set(tokenize(query));
    const hits: SearchHit[] = [];
    for (const d of this.docs) {
      const v = this.vectors.get(d.id);
      const sem = v ? cosine(qv, v) : 0;
      const dToks = new Set(tokenize(`${d.title} ${d.text}`));
      let kw = 0;
      for (const t of qToks) if (dToks.has(t)) kw += 1;
      const meta = d.metadata && Object.values(d.metadata).some((mv) => tokenize(mv).some((t) => qToks.has(t)));
      const metaScore = meta ? 0.5 : 0;
      const score = sem + kw * 0.4 + metaScore;
      if (score > 0) {
        const kind: MatchKind = sem >= 0.3 ? 'semantic' : meta ? 'metadata' : 'keyword';
        hits.push({ doc: d, kind, score });
      }
    }
    return hits.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  all(): SearchDoc[] {
    return this.docs;
  }
}
