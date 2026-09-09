# SUTRA Quickstart

## 0. Prereqs

- **Node ≥ 20** (web, tests)
- **Python ≥ 3.11** (service API — optional but recommended)
- Docker (full stack — optional)
- Ollama or any OpenAI-compatible endpoint (a real model — optional;
  SUTRA Local works offline without any of these)

## 1. Run the web workspace

```bash
cd project3
npm install
cd apps/web
npm run dev
```

Open **http://localhost:3000**.

- **ENTER THE WORKSPACE** → 19 surfaces
- The landing page is a feature tour: every section runs its real logic
  (router ranking, RAG ask, secret scan, the 11-step autonomous pipeline,
  8-step agents, live repo fetch for this very repository).

## 2. Try the built-in loop (no model needed)

1. **Chat** — ask anything; SUTRA Local answers offline, grounded on the
   knowledge base for "what is…" style questions, and says *so* — it shows
   the route decision and reasons.
2. **Knowledge** — ingest a document (paste or upload), then ask the
   knowledge base a question. You get the answer **with source chips**.
   Ask something the doc doesn't cover: it refuses to guess.
3. **Projects** — type `Plan my Project 3 MVP` → structured plan →
   **Accept & create tasks** → edit, reprioritize, archive, convert to a
   workflow.
4. **IDE** — open the workspace → watch the 11-step autonomous pipeline run
   on a real goal; try to approve the deploy with **Deny** and watch it halt.

## 3. Connect a real model (2 minutes)

**Settings → Providers → Ollama:**

```bash
# install ollama (https://ollama.com), then:
ollama pull llama3.1:8b
```

Paste `http://localhost:11434` → **test connection** → pick a model → save.
Chat now streams from Ollama; the route decision reflects the real registry.

**OpenAI-compatible** (vLLM, LM Studio, SGLang, or a hosted API): base URL +
key + model id in Settings → Providers → API.

## 4. Run the service API

```bash
cd project3
python3 -m venv .venv
./.venv/bin/pip install -r services/api/requirements.txt
cd services/api
SUTRA_DATA_DIR=./data ../../.venv/bin/python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

- **http://localhost:8000/docs** — interactive OpenAPI
- Try:

```bash
curl -s localhost:8000/api/v1/route -H 'content-type: application/json' \
  -d '{"text":"Refactor this function and fix the bug"}'

curl -sN localhost:8000/api/v1/chat -H 'content-type: application/json' \
  -d '{"messages":[{"role":"user","content":"Plan my Project 3 MVP"}]}'
```

## 5. Run everything (hybrid mode)

```bash
cd project3
cp infrastructure/.env.example .env
docker compose -f infrastructure/docker-compose.yml up --build
```

| What | Where |
|---|---|
| Web | http://localhost:3000 |
| API docs | http://localhost:8000/docs |
| Grafana (admin / `GRAFANA_PASSWORD`) | http://localhost:3001 |
| Prometheus | http://localhost:9090 |
| Qdrant | http://localhost:6333 |

## 6. Verify (the way we ship)

```bash
npm test                     # 57 vitest cases
cd services/api && ../../.venv/bin/python -m pytest tests/ -q   # 32 cases
cd apps/web && npx tsc --noEmit && npm run build   # 23 static routes
```

## 7. Desktop & mobile

- **Desktop (Tauri):** `apps/desktop` — see its README (requires Rust).
- **Mobile (Expo):** `apps/mobile` — `npm install && npm start` with the
  Expo Go app; points at the service API on your LAN.

## Troubleshooting

| Symptom | Fix |
|---|---|
| "no reachable provider in local mode" | expected without Ollama/API configured — configure in Settings, or use SUTRA Local features |
| Ollama test fails | `ollama serve` running? URL includes port 11434? |
| Chat pins a cloud model but you want local | Settings → Privacy → mode `local`, or pin a local model in Chat |
| Port 3000 busy | `npm run dev -- -p 3002` |
