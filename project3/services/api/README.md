# SUTRA Service API

The primary backend surface of the SUTRA workspace. **Local-first, provider-neutral, OTel-compatible.**
The web/desktop/mobile clients all speak this API; in local mode the process never phones home.

## Run

```bash
cd project3
python3 -m venv .venv && ./.venv/bin/pip install -r services/api/requirements.txt
cd services/api
SUTRA_DATA_DIR=./data ../../.venv/bin/python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Interactive docs: `http://localhost:8000/docs`

## Endpoints (v1)

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | service health, privacy mode, configured backends |
| GET | `/api/v1/models` | model registry (8 runtimes) |
| POST | `/api/v1/route` | Request → Task Analysis → Model Ranking → chosen model |
| POST | `/api/v1/chat` | **SSE stream** — SUTRA Local, Ollama, or any OpenAI-compatible runtime |
| POST | `/api/v1/models/{id}/ping` | connectivity probe for a model's runtime |
| POST | `/api/v1/rag/ingest` | Ingest → Parse → Chunk (420/90) → embed (384-dim local) |
| GET | `/api/v1/rag/documents` | document index |
| POST | `/api/v1/rag/query` | Retrieve (dense 0.55 + BM25 0.45) → grounded answer with citations |
| POST | `/api/v1/security/assess` | risk classification with reasons (Low/Med/High/Critical) |
| POST | `/api/v1/security/scan` | secret scan — findings are location+kind only, never the secret |
| POST | `/api/v1/workflows/validate` | DAG validation (trigger, edges, cycles) |
| POST | `/api/v1/workflows/topo` | execution order |
| POST | `/api/v1/workflows/n8n` | export **standard n8n JSON** (adapter; respects n8n terms) |
| GET/POST/PATCH/DELETE | `/api/v1/tasks` | task CRUD (p0–p3, assignees, tags, due, archive) |
| POST | `/api/v1/deploy/local` | pre-deploy secret scan → bundle manifest + hash (secrets ⇒ 409) |
| GET | `/api/v1/deployments` | deployment history |
| GET | `/api/v1/traces` | in-process OTLP/JSON document (same shape as the web build) |
| GET | `/api/v1/audit` | egress + action audit log |

## Privacy (never silently upload private data)

- `SUTRA_PRIVACY_MODE=local` (default): outbound HTTP is only allowed to **private/loopback**
  hosts (your Ollama, self-hosted vLLM, …). Any egress attempt to a public host is
  **blocked and recorded** in `/api/v1/audit`.
- `hybrid`/`cloud`: configured provider hosts are allowed; **every** outbound request is still logged.
- Secrets are never echoed: `/security/scan` and deploy scans return line + kind only.

## Configuration

| Env | Default | Notes |
|---|---|---|
| `SUTRA_ENV` | `development` | |
| `SUTRA_PRIVACY_MODE` | `local` | `local` · `hybrid` · `cloud` |
| `SUTRA_SYNC_SCOPE` | `none` | `none` · `metadata` · `projects` · `folders` · `workspace` |
| `OLLAMA_URL` | `http://localhost:11434` | local runtime |
| `OPENAI_BASE_URL` / `OPENAI_API_KEY` / `OPENAI_MODEL` | — | any `/chat/completions` endpoint (vLLM, LM Studio, SGLang, …) |
| `OTLP_ENDPOINT` | — | optional OTLP/HTTP export |
| `SUTRA_DATA_DIR` | `./data` | JSON persistence (documents, tasks, bundles, audit) |
| `SUTRA_CORS_ORIGINS` | `*` | |

## Tests

```bash
cd services/api && ../../.venv/bin/python -m pytest tests/ -q   # 32 tests
```

## Design notes

- **No database required.** State is JSON under `SUTRA_DATA_DIR`; PostgreSQL/Redis/
  vector-DB adapters slot in for cloud mode without touching route code.
- **Deterministic offline intelligence:** the model router, risk policy, chunker,
  embeddings (384-dim hash), BM25 and the grounded answerer are pure functions —
  identical contracts to the TypeScript build in `packages/shared`.
- **Critical risk is never masked** by a session grant — the same rule as the web app.
