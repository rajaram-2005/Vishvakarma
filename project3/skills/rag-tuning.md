# RAG Tuning — playbook

Goal: raise the grounded-answer rate of a knowledge base without raising
hallucination.

## Procedure

1. **Baseline.** Run the sample queries through the default pipeline
   (chunk 420 / overlap 90, dense 0.55 + BM25 0.45). Record:
   - `recall@5` — does the gold chunk appear in top-5?
   - `grounded-rate` — answer shares ≥ 0.34 meaningful-word overlap with context
2. **Chunk sweep.** Try chunk sizes 280 / 420 / 560 with overlaps 60 / 90 / 120.
   Shorter chunks = precise retrieval; longer = better context. Prefer the
   config with the best grounded-rate that keeps recall@5 ≥ 0.9.
3. **Rerank blend.** Increase the dense weight for semantic questions, the
   BM25 weight for exact-term questions (IDs, error codes).
4. **Citations.** Every answer must reference `[n]`; hovering a chip must
   reveal the exact chunk. A dangling citation is a bug.
5. **Gate check.** Re-run refusal probes. The evidence gate must still
   refuse questions the corpus does not support. If tuning made the model
   "confident," you've broken the gate — revert.

## Definition of done

- grounded-rate ≥ baseline
- refusal probes still refuse (hallucination rate does not rise)
- all citations resolvable
