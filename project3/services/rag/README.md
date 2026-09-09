# SUTRA RAG

The retrieval boundary as a service: **Ingest → Parse → Chunk (420/90) →
Embed (384-dim local hash) → Retrieve (dense 0.55 + BM25 0.45) → Rerank →
Context → Generate → Cite.**

- `POST /ingest` — `{title, text, source?, kind?}`
- `GET /documents` · `DELETE /documents/{id}`
- `POST /query` — `{query, k?}` → grounded answer + cited hits
- `GET /health`

The generator is evidence-gated: if the retrieved context shares almost none
of the question's meaningful words, it refuses to answer instead of
hallucinating ("I can't verify this… so I won't guess"). Vector DB adapters
(Postgres+pgvector, Qdrant) replace the in-memory index in cloud mode without
changing the contract.
