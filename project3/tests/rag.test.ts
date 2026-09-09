import { describe, expect, it } from 'vitest';
import { embed, EMBED_DIM } from '@sutra/shared';
import { generate, ingestText, retrieve } from '../apps/web/lib/rag';
import { LOCAL, SETTINGS } from './helpers';

const DOC = [
  'Security model. Every tool call flows Agent → Tool Gateway → Policy → Sandbox → Execution.',
  'The gateway classifies risk as Low, Medium, High or Critical and routes dangerous operations to human approval.',
  'Never silently perform dangerous operations. Approvals are Allow Once, Allow Session, or Inspect.',
  'RAG pipeline. Documents are ingested, chunked at 420 characters with 90 overlap, embedded locally.',
  'Retrieval blends dense similarity (0.55) with BM25 (0.45), reranks, and the answer cites sources [1], [2].',
  'Memory stores what the system knows: facts, preferences, episodes. Skills encode how the system works.',
].join('\n\n');

describe('ingestText', () => {
  it('chunks documents deterministically', () => {
    const { doc, chunks } = ingestText('Design doc', DOC, 'test', 'text');
    expect(doc.chunkCount).toBe(chunks.length);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(c.docId).toBe(doc.id);
      expect(c.text.length).toBeGreaterThan(0);
      expect(embed(c.text).length).toBe(EMBED_DIM);
    }
  });

  it('ignores empty documents', () => {
    const { doc, chunks } = ingestText('Empty', '   ', 'test', 'text');
    expect(chunks).toHaveLength(0);
    expect(doc.chunkCount).toBe(0);
  });
});

describe('retrieve', () => {
  it('ranks relevant chunks first', () => {
    const { chunks } = ingestText('Design doc', DOC, 'test', 'text');
    const hits = retrieve(chunks, 'How does the security gateway classify risk?', 3);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.length).toBeLessThanOrEqual(3);
    const joined = hits.map((h) => h.chunk.text).join(' ');
    expect(joined.toLowerCase()).toMatch(/gateway|risk|approval/);
    // scores are sorted descending
    for (let i = 1; i < hits.length; i++) {
      expect(hits[i - 1].score).toBeGreaterThanOrEqual(hits[i].score);
    }
  });

  it('returns nothing for an empty chunk store', () => {
    expect(retrieve([], 'anything')).toHaveLength(0);
  });
});

describe('generate (SUTRA Local grounding)', () => {
  it('answers with a grounded response and sources', async () => {
    const { chunks } = ingestText('Design doc', DOC, 'test', 'text');
    const out = await generate(chunks, 'What risk levels does the gateway use?', [LOCAL], SETTINGS);
    expect(out.model).toBe('sutra-local');
    expect(out.hits.length).toBeGreaterThan(0);
    expect(out.answer.length).toBeGreaterThan(10);
    expect(out.answer.toLowerCase()).toMatch(/risk|low|medium|high|critical|gateway/);
  }, 15000);

  it('admits when the context is insufficient', async () => {
    const { chunks } = ingestText('Small doc', 'SUTRA is a local-first workspace.', 'test', 'text');
    const out = await generate(chunks, 'What is the population of Nairobi?', [LOCAL], SETTINGS);
    expect(out.answer.toLowerCase()).toMatch(/not enough|insufficient|cannot|can't|no (direct )?evidence|context/);
  }, 15000);
});
