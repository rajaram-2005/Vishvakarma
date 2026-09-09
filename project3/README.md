# SUTRA — Project 3

**The open AI ecosystem workspace.** A local-first, provider-neutral,
production-grade operating surface for building, automating, evaluating and
deploying AI systems.

> Models. Agents. Tools. Knowledge. Workflows. Local AI.
> One workspace to build, automate, evaluate, and deploy AI systems.

**One workspace. Infinite possibilities.**

Contact: [ramkpraja175@gmail.com](mailto:ramkpraja175@gmail.com) · +91 488407998

---

## What is SUTRA?

SUTRA is an **AI operating universe**, not a SaaS dashboard: a cinematic
dark-first web app (plus desktop, mobile and API surfaces) in which every
capability — models, routing, agents, teams, skills, memory, RAG, knowledge,
tools, browser automation, IDE, security, evaluation, observability,
deployment, marketplace — is a first-class, composable, **auditable** citizen.

Core rules, enforced in code, not in marketing:

1. **Local-first.** In local mode, chat, routing, RAG, memory, tasks,
   workflows, coding and testing run fully offline. Nothing phones home.
2. **Provider-neutral.** Models are declared with a runtime adapter
   (Ollama, llama.cpp, vLLM, SGLang, Transformers, MLX, ONNX Runtime,
   TensorRT-LLM, OpenAI-compatible). No vendor lock-in.
3. **Never silently.** Dangerous operations are risk-classified
   (Low/Medium/High/Critical) and routed to a human — *Allow Once /
   Allow Session / Inspect*. Critical risk is never masked by a session
   grant. Private data is never uploaded silently.
4. **Observable.** Every request produces OpenTelemetry-compatible spans:
   Request → Router → Model → Agent → Tool → Workflow → Response.
5. **Reproducible.** Evaluation runs compute accuracy, factuality,
   hallucination, completion, latency, tokens, memory, tool success,
   security, cost and reproducibility.

## Repository layout

```
project3/
├── apps/
│   ├── web/          # Next.js 15 + Tailwind + Framer Motion — landing + 19-surface workspace + premium IDE
│   ├── desktop/      # Tauri v2 shell (Win/macOS/Linux)
│   └── mobile/       # Expo / React Native — AI control center (not a shrunken desktop)
├── services/         # Python/FastAPI — api (primary), auth, router, agent, registry,
│   │                 # discovery, evaluation, memory, rag, security, deployment, marketplace
├── packages/         # TypeScript monorepo packages
│   ├── shared/       #   types, security policy, OTel export, embeddings, utils
│   ├── model-adapters/   # router + ollama / openai-compat / sutra-local providers
│   ├── tool-adapters/    # 11 builtin tools + risk gateway
│   ├── workflow-sdk/     # DAG validation, topo order, n8n JSON export
│   ├── evaluation-sdk/   # smoke suite + metrics
│   ├── plugin-sdk/       # manifest validation + scopes
│   ├── puter-adapter/    # optional Puter layer (KV/FS/auth/AI/hosting), local fallback
│   └── sdk/            # umbrella SDK
├── agents/           # agent definitions (JSON)
├── workflows/        # bundled workflows (SUTRA JSON + n8n-compatible)
├── skills/           # skill manifests (the HOW)
├── plugins/          # plugin examples (manifest-first)
├── benchmarks/       # benchmark configs + results
├── infrastructure/   # Dockerfiles, docker-compose, k8s, observability
├── docs/             # architecture, quickstart, privacy, data flow, API
└── tests/            # vitest (TypeScript) — 57 cases
```

## Quick start

### Web (local mode — zero dependencies beyond Node)

```bash
cd project3
npm install
cd apps/web
npm run dev          # http://localhost:3000
```

Production: `npm run build && npm start`.

**Landing → ENTER THE WORKSPACE** opens the 19-surface workspace:
Home · Chat · Projects · Agents · Teams · Models · Tools · Skills ·
Knowledge · Memory · Workflows · MCP · Plugins · Evaluation · Security ·
Activity · Deployments · Marketplace · Settings.

### Connect a real model (optional)

Settings → Providers:
- **Ollama** — set `http://localhost:11434`, hit *test*, pick a model
- **OpenAI-compatible** — vLLM, LM Studio, SGLang or any API: base URL + key + model

Until then, **SUTRA Local** (the built-in offline responder) keeps everything
functional.

### Service API (Python) + wire the web to it

```bash
cd project3
python3 -m venv .venv && ./.venv/bin/pip install -r services/api/requirements.txt
cd services/api
../../.venv/bin/python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
# interactive docs: http://localhost:8000/docs
```

Then in the web app: **Settings → SUTRA API** → `http://localhost:8000` → **test**.
The workspace then routes chat, routing, security scans and workflow/n8n export
through the Python service layer (same contracts as the local core; every call
is traced; any failure falls back to the local core). In **local privacy mode
the API is ignored — the workspace stays fully offline by contract.**
Verify the whole loop with `SUTRA_E2E_API=http://localhost:8000 npx vitest run tests/e2e.api.test.ts`.

### Full stack (hybrid mode)

```bash
docker compose -f infrastructure/docker-compose.yml up --build
# web :3000 · api :8000 · grafana :3001 · prometheus :9090 · otel :4317/:4318
```

See [`infrastructure/README.md`](infrastructure/README.md).

### Tests

```bash
npm test                                # 74 vitest cases (router, planner, security,
                                        # workflow+n8n, codecheck, terminal, RAG, OTel,
                                        # gateway, local-responder parity, server client)
SUTRA_E2E_API=http://localhost:8000 npx vitest run tests/e2e.api.test.ts  # 6 live E2E
cd services/api && ../../.venv/bin/python -m pytest tests/ -q   # 44 cases
```

## Feature map

| Surface | What it does | Real? |
|---|---|---|
| **Landing** | 28 cinematic sections: hero → AI core → ecosystem → models → routing → agents → teams → skills → memory → RAG → tools → MCP → GitHub → n8n → IDE → browser → autonomous development → security → evaluation → observability → deployment → Puter.js → desktop → mobile → marketplace → enterprise → final vision | live demos: router, RAG ask, secret scan, 11-step autonomous pipeline with real approval gate, 8-step agents, live `fetchRepo` on this repository |
| **Chat** | model pinning, route chips with reasons, streaming, "remember that…" → memory; optional **SUTRA API** backend (Settings) with automatic local-core fallback | ✓ |
| **Projects** | AI To-Do on Puter KV (or local fallback): CRUD, priority p0–p3, tags, due, archive, reorder; `Plan my Project 3 MVP` → structured plan with accept/reject/regenerate/assign/convert-to-workflow | ✓ |
| **Agents / Teams** | 7 agents · 8-step loop · orchestrator handoffs | ✓ |
| **Models** | registry, runtime adapters, connectivity tests, router tester | ✓ |
| **Tools** | 11 builtin tools, risk badges, live gateway verdicts | ✓ |
| **Knowledge (RAG)** | ingest (paste/upload) → chunk → embed (384-d) → retrieve (dense+BM25) → answer with citations | ✓ |
| **Memory** | facts/preferences/episodes, semantic search, always deletable | ✓ |
| **Workflows** | DAG editor, live simulation (AI/HTTP/setVar/condition/approval/shell), **standard n8n JSON export** | ✓ |
| **MCP** | discovery, install with permissions, health, audit, versioning | ✓ |
| **Plugins** | manifest validation, scope review, enable/disable | ✓ |
| **Evaluation** | two-run suite → accuracy/factuality/hallucination/latency/cost/reproducibility | ✓ |
| **Security** | policy matrix, approval queue (Allow Once/Session/Inspect), command risk scan, secret scan (never echoes secrets) | ✓ |
| **Activity** | unified timeline + trace waterfall drill-down | ✓ |
| **Deployments** | local · Docker (generated Dockerfile) · Puter cloud; secret-gated bundles | ✓ |
| **Marketplace** | catalog + explicit scope grants | ✓ |
| **IDE** | File Tree \| Code Editor (syntax highlight, dirty tracking) \| AI Agent; Terminal · Tests · Git · Browser · Logs · Security tabs; 11-step autonomous pipeline (Goal → Architect → Planner → Coder → Terminal → Browser → Tester → Security → Reviewer → Approval → Deploy) | ✓ |

## Privacy model

- **Modes:** Local (default) · Hybrid · Cloud
- **Sync:** None · Metadata · Selected Projects · Selected Folders · Workspace
- Local mode is **fully offline-capable**; egress to non-private hosts is
  blocked and audited by the service API.
- Puter is an **optional** layer (KV persistence, cloud FS, auth, AI,
  hosting, tasks) — never forced in local mode. “Powered by Puter” →
  [developer.puter.com](https://developer.puter.com)

## Themes & motion

Dark (default) · Light · Aurora — with full **reduced-motion** support.
Ambient soundscape is **off by default**.

## License & terms

MIT for SUTRA code. Third-party integrations (Puter, n8n, GitHub, Hugging
Face, MCP servers) respect their respective terms — integration is via
adapters, with explicit scopes and audit.
