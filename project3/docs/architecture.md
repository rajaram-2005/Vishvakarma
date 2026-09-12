# Aetherion Architecture

## Principles

1. **Local-first.** The browser/desktop process is a complete system: virtual
   FS, git VM, KV store, model router, RAG, memory, agent loop, security
   gateway, workflow engine, evaluation harness, deploy bundler. Network is a
   *feature*, not a dependency.
2. **Provider-neutral.** `ModelInfo` declares `runtime`; adapters
   (`OllamaProvider`, `OpenAICompatProvider`, `SutraLocalProvider`, …)
   implement one interface: `chat(stream)`, `ping()`. Adding a runtime
   (llama.cpp, vLLM, SGLang, Transformers, MLX, ONNX, TensorRT-LLM) is a new
   adapter — nothing else changes.
3. **Deterministic core.** Routing, risk policy, chunking, embeddings, BM25,
   workflow validation, metrics: pure functions, offline, unit-tested —
   implemented **twice** (TypeScript `packages/shared`, Python
   `services/api/app/core.py`) with identical contracts, so web and API
   agree.
4. **Never silently.** The security invariant, everywhere:
   - `assess(category, detail)` → risk + reasons
   - requires-approval ⇒ **human decision** (Allow Once / Session / Inspect)
   - **critical ⇒ always asks again**, even with a session grant
   - secrets: detected, masked, never echoed

## Layers

```
┌──────────────────────────────────────────────────────────────────┐
│ SURFACES                                                         │
│  apps/web (Next.js) · apps/desktop (Tauri) · apps/mobile (Expo)  │
├──────────────────────────────────────────────────────────────────┤
│ CLIENT CORE (TypeScript)                                         │
│  store (LS 'sutra:app:v3') · chat · planner · rag · terminal ·  │
│  gitvm · codecheck · deploy · puter adapter · ambient audio      │
│  @sutra/* packages: shared · model-adapters · tool-adapters ·    │
│  workflow-sdk · evaluation-sdk · plugin-sdk · sdk                │
├──────────────────────────────────────────────────────────────────┤
│ SERVICE BOUNDARY (Python/FastAPI) — optional, same contracts     │
│  api · auth · router · agent · registry · discovery ·            │
│  evaluation · memory · rag · security · deployment · marketplace │
│  ⇄ wired to web via apps/web/lib/server.ts (Settings → Aetherion API)│
├──────────────────────────────────────────────────────────────────┤
│ RUNTIMES & DATA (yours)                                          │
│  Ollama · llama.cpp · vLLM · SGLang · any /chat/completions      │
│  JSON store (local) · PostgreSQL · Redis · Qdrant (cloud mode)   │
└──────────────────────────────────────────────────────────────────┘
        ▲ OTel-compatible spans flow upward (web store Tracer ⇄ OTLP JSON)
```

## Request path (chat)

```
user prompt
  → reachableModels()            # which models can THIS surface reach
  → route(models, text)          # Request → Task Analysis → Ranking → chosen
  → providerFor(chosen)          # adapter selection
  → provider.chat(stream)        # SSE to UI; every chunk is a span child
  → on "remember that X"         # → memory (WHAT)
```

## Agent path

```
goal → Understand → Plan → Tools (scope check) → Execute (gateway per call)
     → Observe → Verify → Repair (bounded) → Finalize
     → every step: span + audit entry; every tool call: assess()
```

## Autonomous development path (IDE)

```
Goal → Architect (docs/ARCHITECTURE.md) → Planner (docs/PLAN.md)
     → Coder (src + tests) → Terminal (real sandboxed runCommand)
     → Browser (nav log) → Tester (real runSuite)
     → Security (real scanForSecrets) → Reviewer
     → Approval (real gate → ApprovalQueue; denial halts)
     → Deploy (real runDeployment; deploy is always critical ⇒ human)
```

## Security model

```
Agent → Tool Gateway → Policy → Sandbox → Execution
```

- 12 categories, baselines in `DEFAULT_POLICY` (fs.read low … deploy critical)
- 14 dangerous signatures escalate to **critical** (recursive delete, sudo,
  mkfs/dd, chmod 777, fork bomb, curl|sh, base64 -d, force push, eval(,
  DROP/TRUNCATE, reverse shell, /etc/passwd|shadow)
- Session grants: per-category, revocable, **never mask critical**
- Secret isolation: `env` masks keys; scans return line+kind only
- Egress guard (service): local mode allows private hosts only; all egress
  audited (`GET /api/v1/audit`)

## Observability

- Web: `Tracer` in the store → `Trace{id,name,start,end,status,spans[]}`
  → waterfall UI (Activity + every surface) + `toOtlpJson()`
- API: per-request spans → in-process buffer → `GET /api/v1/traces`
  (OTLP document) → optional OTLP/HTTP export to the collector
- Stack: OTel collector → Prometheus → Grafana (provisioned, see
  `infrastructure/observability/`)

## Data & sync

- Web state: localStorage `sutra:app:v3` (versioned; `SEED_VERSION` migrates)
- Service state: JSON files under `Aetherion_DATA_DIR` (atomic writes)
- Tasks (Projects): Puter KV `sutra:tasks:<projectId>` when signed in,
  localStorage `sutra:kv:` fallback — debounced 250 ms, mirrored to the store
- Sync scopes: none → metadata → selected projects → selected folders →
  workspace; enforcement is per-outbound-request, never batched silently

## Failure semantics (honest errors)

- No reachable provider in local mode ⇒ explicit 409 / UI notice, never a
  fake answer
- RAG with insufficient evidence ⇒ "I can't verify this … so I won't guess"
- Deploy with secret patterns ⇒ 409 `secrets_detected`, bundle not written
- Upstream model failure mid-stream ⇒ SSE error frame, stream stays honest
