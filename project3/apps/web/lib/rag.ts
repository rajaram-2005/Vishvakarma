// Aetherion — RAG pipeline:
// Ingest → Parse → Chunk → Embed → Retrieve → Rerank → Context → Generate → Cite

import type { Chunk, KnowledgeDoc, Settings } from '@sutra/shared';
import { BM25, chunkText, cosine, embed, uid } from '@sutra/shared';
import { providerFor, reachableModels } from './providers';
import type { ModelInfo } from '@sutra/shared';

export interface IngestResult {
  doc: KnowledgeDoc;
  chunks: Chunk[];
}

export function ingestText(title: string, text: string, source: string, kind: KnowledgeDoc['kind']): IngestResult {
  const id = uid('doc');
  const chunks = text.trim() ? chunkText(text, id) : [];
  const doc: KnowledgeDoc = {
    id,
    title: title.trim() || 'Untitled document',
    source,
    kind,
    createdAt: new Date().toISOString(),
    chars: text.length,
    chunkCount: chunks.length,
  };
  return { doc, chunks };
}

export interface Hit {
  chunk: Chunk;
  score: number;
  dense: number;
  sparse: number;
}

/** Retrieve → Rerank (0.55 dense + 0.45 BM25, min-max normalized). */
export function retrieve(chunks: Chunk[], query: string, k = 5): Hit[] {
  if (!chunks.length) return [];
  const qv = embed(query);
  const bm = new BM25(chunks.map((c) => c.text));
  const scored = chunks.map((c) => {
    const dense = cosine(qv, embed(c.text));
    const sparse = bm.score(query, chunks.indexOf(c));
    return { chunk: c, dense, sparse };
  });
  const maxSparse = Math.max(...scored.map((s) => s.sparse), 0.0001);
  return scored
    .map((s) => ({
      chunk: s.chunk,
      dense: s.dense,
      sparse: s.sparse / maxSparse,
      score: 0.55 * s.dense + 0.45 * (s.sparse / maxSparse),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

export interface RAGAnswer {
  answer: string;
  hits: Hit[];
  model: string;
}

/** Context → Generate → Cite. Uses a reachable model; Aetherion Local grounds offline. */
export async function generate(
  chunks: Chunk[],
  query: string,
  models: ModelInfo[],
  settings: Settings,
  forceModel?: string,
): Promise<RAGAnswer> {
  const hits = retrieve(chunks, query, 4);
  const context = hits.map((h, i) => `[${i + 1}] (${h.chunk.heading}) ${h.chunk.text}`).join('\n\n');
  const sys = `Answer the question using ONLY the context below. Cite sources as [1], [2] etc. If the context is insufficient, say so plainly.
Context:
${context}`;
  const pool = reachableModels(models, settings);
  const m =
    (forceModel && pool.find((x) => x.id === forceModel)) ||
    pool.find((x) => x.id !== 'sutra-local') ||
    pool[0];
  const provider = providerFor(m, settings) ?? providerFor({ ...pool[0], id: 'sutra-local' }, settings);
  if (!provider) throw new Error('no provider available');
  let answer = '';
  await provider.chat(
    {
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: query },
      ],
      temperature: 0.3,
      maxTokens: 900,
    },
    (c) => {
      if (!c.done && c.text) answer += c.text;
    },
  );
  return { answer, hits, model: provider.modelId };
}
