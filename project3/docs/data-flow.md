# SUTRA Data Flows

## 1. Chat (streaming)

```
[UI] ChatInput
  → store.chat()                       # provider = pinned ?? routed
  → reachableModels(mode)              # local mode filters to local runtimes
  → route(models, prompt)              # analysis + ranking + chosen
  → provider.chat(stream)
      OllamaProvider        → POST {OLLAMA_URL}/api/chat        (NDJSON)
      OpenAICompatProvider  → POST {BASE}/chat/completions      (SSE)
      SutraLocalProvider    → in-process grounded responder
  → per chunk: store state + span child + UI token
  → "remember that X" → memory.entries (scoped)
```

Every request: `span "http POST /chat"` (API) or store Tracer (web) with
children: `route.decide`, `model.<id>.stream`, `memory.write?`.

## 2. RAG

```
ingest:  text → parse(paras) → chunk(420/90) → embed384(hash)
         → index {chunks, bm25, dense}  (+ doc meta in documents[])

query:   q → embed384(q)
         → dense: cosine(q, chunk)                     ×0.55
         → sparse: normalized BM25(q, chunk)           ×0.45
         → top-k → rerank (position + score)
         → context "[n] heading text"
         → evidence gate: overlap(q, ctx) < 0.34 → REFUSE
         → grounded answer + citations [n] → UI chips (hover = chunk text)
```

## 3. Agent run

```
goal
 → step Understand  → span + audit
 → step Plan        → subtasks[]
 → step Tools       → scopes ∩ agent.permissions (else 403)
 → step Execute     → per call: gateway:
                        assess(category, detail)
                        risk critical? → approval (never auto)
                        high/medium?   → approval unless session-grant
                        low?           → pass
                        sandbox: workspace fs / terminal / network egress guard
 → step Observe     → outputs, exit codes
 → step Verify      → re-run checks
 → step Repair      → bounded (≤1)
 → step Finalize    → report → fs reports/<agent>-<id>.md + trace
```

## 4. Autonomous development (IDE pipeline)

```
Goal → Architect → Planner → Coder → Terminal → Browser → Tester
     → Security → Reviewer → Approval → Deploy
```

- Coder: real edits to the virtual FS (import resolution checked)
- Terminal: real `runCommand` against the virtual FS (relative-safe paths)
- Tester: real `runSuite` over generated test files
- Security: real `scanForSecrets` over every written file — a finding halts
  the pipeline (it would never be deployed)
- Approval: real gate → `ApprovalQueue` (Allow Once / Session / Inspect /
  Deny). **Deny or timeout → pipeline halts; no deploy.**
- Deploy: real `runDeployment` — always critical risk ⇒ always human.

## 5. Workflow engine

```
trigger → nodes (Kahn topo order)
  ai        → grounded answer from the (routed) model
  http      → GET only, host logged (egress guard in service mode)
  setVar    → vars[n.key] = value
  condition → `${expr}` evaluation, true/false branch
  approval  → human decision
  shell     → runCommand (gateway-checked)
outputs: per-node logs + vars + status → simulation panel / Activity trace
```

## 6. Evaluation

```
suite[7] × run1 (+run2)
 → accuracy · factuality · hallucination rate (refusal probes)
 → completion · avg/p95 latency · tokens · estimated cost
 → reproducibility = mean(|run1 − run2| < ε)
→ report (web Evaluation surface ⇄ services/evaluation contract)
```

## 7. Deployment

```
workspace snapshot (virtual FS)
 → secret scan (every file) → findings? 409, nothing written
 → target:
     local  → bundle dir + manifest (sha256)
     docker → Dockerfile generation + image ref
     puter  → requires explicit sign-in (never forced) → /sutra/deployments/<id>
 → deployments[] + trace span "deploy <name>"
```

## 8. Observability

```
web Tracer / API Tracer
 → Trace{spans[]} → waterfall UI (Activity drill-down)
 → toOtlpJson() → OTLP/HTTP (OTLP_ENDPOINT) → otel-collector
 → collector → Prometheus (metrics) → Grafana
 → traces: in-process buffer; swap collector exporter for Loki/Jaeger
```
