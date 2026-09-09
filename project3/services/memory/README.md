# SUTRA Memory

The **WHAT** of the system: facts, preferences, episodes. Local JSON storage,
scoped (`user` or `project:<id>`), semantically searchable with the same
384-dim deterministic hash-embeddings as the web build, always visible and
deletable.

- `GET /?scope=&kind=` — list
- `POST /` — `{text, kind: fact|preference|episodic, scope?, source?}`
- `DELETE /{id}` — delete (user-in-the-loop on every surface)
- `POST /search` — `{q, k?, scope?}` → similarity hits
- `GET /health`

Privacy: memory lives in `SUTRA_DATA_DIR`; sync (if ever enabled) is
explicit per `SUTRA_SYNC_SCOPE` and never silent.
