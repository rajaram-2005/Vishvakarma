# Aetherion Service API Reference

Base URL: `http://localhost:8000` · OpenAPI: `/docs` · Health: `/health`

All bodies are JSON. Errors: `422` validation (detail: string or
`{errors[]}`), `404`, `409` (policy/secret/scope conflicts — detail is
descriptive), `502` (upstream provider).

## Models & routing

### GET /api/v1/models
```json
{ "models": [ { "id":"sutra-local", "name":"Aetherion Local", "runtime":"sutra-local",
  "contextWindow":16384, "costIn":0, "costOut":0, "latencyTier":"low",
  "capabilities":["code","structured"], "available":true, "local":true } ] }
```

### POST /api/v1/route
req: `{ "text": string, "requireLocal"?: bool, "forceModel"?: string }`
```json
{ "analysis": { "intents":["code"], "needsLocal":false, "charCount":42, "label":"code" },
  "ranking": [ { "modelId":"llama3.1-8b", "score":93, "reasons":["matches code","fast tier"] } ],
  "chosen": { "id":"llama3.1-8b", "name":"Llama 3.1 8B", "runtime":"ollama", ... } }
```
Intents: `code · math · long-context · creative · structured · general`.
`forceModel` pins the choice (score 100, first in ranking).

### POST /api/v1/chat  *(SSE)*
req: `{ "messages":[{role,content}], "modelId"?, "requireLocal"?, "temperature"?, "maxTokens"? }`
stream:
```
event: route
data: {"model":"sutra-local","runtime":"sutra-local","reasons":[...]}

data: {"text":"Hel"}
data: {"text":"lo"}
data: {"done":true,"model":"sutra-local","chars":87}
```
Errors surface as `data: {"error": "..."}` frames (honest mid-stream failure)
or `409` before the stream starts (no reachable provider in local mode).

### POST /api/v1/models/{id}/ping
→ `{ "ok": bool, "latencyMs": int, "detail": string }`

## RAG

### POST /api/v1/rag/ingest
req: `{ "title", "text", "source"?, "kind"? }` → `{ "doc": {...}, "chunks": n }`

### GET /api/v1/rag/documents · DELETE is via state (local)

### POST /api/v1/rag/query
req: `{ "query", "k"? }`
```json
{ "answer": "…", "model": "sutra-local (grounded)",
  "hits": [ { "score": 0.71, "chunk": {"id":"…","docId":"…","heading":"…","text":"…"} } ] }
```
Evidence gate: insufficient overlap ⇒ refusal answer, no guess.

## Security

### POST /api/v1/security/assess
req: `{ "category", "detail"? }` →
`{ "risk":"critical","requiresApproval":true,"reasons":["signature: recursive delete"],"category":"terminal.exec" }`

### POST /api/v1/security/scan
req: `{ "text" }` → `{ "findings":[{"line":1,"kind":"OpenAI-style API key"}], "clean":false, "note":"…never the secret" }`

## Workflows

Aetherion workflow JSON:
```json
{ "id":"wf", "name":"On-call digest", "trigger":"manual",
  "nodes":[{"id":"a","type":"trigger","label":"Start","config":{}}],
  "edges":[["a","b"]] }
```
Node types: `trigger · ai · http · shell · condition · setVar · approval`.

- **POST /api/v1/workflows/validate** → `{ "errors": [], "valid": true }`
  (errors: missing name/nodes/trigger, unknown edge endpoints, self-loop, cycle)
- **POST /api/v1/workflows/topo** → `{ "order": ["a","b"] }`
- **POST /api/v1/workflows/n8n** → **standard n8n JSON**
  ```json
  { "name":"…", "nodes":[{ "parameters":{"prompt":"…"}, "id":"…", "name":"Think",
     "type":"@n8n/n8n-nodes-langchain.chainLlm", "typeVersion":1.7, "position":[0,0] }],
    "connections":{ "Start":{"main":[[{"node":"Think","type":"main","index":0}]]} },
    "settings":{"executionOrder":"v1"} }
  ```
  `trigger → n8n-nodes-base.manualTrigger`, `approval → n8n-nodes-base.noOp`
  (n8n has no native approval node — documented mapping, respects n8n terms).

## Tasks

```
GET    /api/v1/tasks?status=todo|inprogress|done|blocked
POST   /api/v1/tasks        { "title","description"?,"priority":"p0..p3","category"?,"tags"?,"due"?,"assignee"? }
PATCH  /api/v1/tasks/{id}   (any subset of the above + status/archived/order)
DELETE /api/v1/tasks/{id}
```
Defaults: `status:todo`, `assignee:{kind:"human",id:"human",name:"You"}`.

## Deployments

### POST /api/v1/deploy/local
req: `{ "name", "files": { "path": "content" } }`
→ `201 { "id","target":"local","status":"success","bundleHash","secretScan":"clean", "files":{...} }`
· `409 { reason:"secrets_detected", findings:[{file,line}] }` — bundle not written.

### GET /api/v1/deployments

## Observability

- **GET /api/v1/traces** → `{ "document": <OTLP/JSON resourceSpans>, "spans": n }`
  same document shape as `toOtlpJson()` in `packages/shared`.
- **GET /api/v1/audit** → egress + action log (local mode: blocked egress is
  the interesting part).

## Other services

Each service in `services/` mirrors the same shape with a smaller surface —
see each `services/<name>/README.md` and its `/docs` when running.

## Web client integration

`apps/web/lib/server.ts` is the browser client for this API (same contracts as
the local core, so the web app is one setting away from running on either):

- **Settings → Aetherion API** sets `settings.server.baseUrl`; empty = local core only
- **Local privacy mode ignores the server entirely** — enforced in the client
  (`serverUsable()`), matching the service-side egress guard
- Chat streams over SSE (`event: route` frame → `data: {text}` chunks →
  `data: {done}`); any failure (unreachable, HTTP, timeout, stream error)
  falls back to the local core and is recorded as an error span
- Security surface: command risk + secret scan run locally first (instant),
  then refresh from the server when configured — "via Aetherion API" chip shows
  which copy produced the verdict
- Verify the live loop:
  `Aetherion_E2E_API=http://localhost:8000 npx vitest run tests/e2e.api.test.ts`

## Client contracts (TypeScript ⇄ Python parity)

| Concern | TS (`packages/shared`) | Python (`services/api/app/core.py`) |
|---|---|---|
| risk policy | `DEFAULT_POLICY` | `DEFAULT_POLICY` |
| dangerous sigs | 14 regexes | 14 regexes |
| intents | same 6 | same 6 |
| embedding | 384-d fnv-hash | 384-d fnv-hash |
| chunk | 420 / 90 | 420 / 90 |
| retrieve | 0.55 dense + 0.45 BM25 | 0.55 dense + 0.45 BM25 |
| evidence gate | < 0.34 → refuse | < 0.34 → refuse |
| n8n export | standard JSON | standard JSON |
| local responder | `buildLocalReply` (math, plan, grounded, probes, sentiment, extract, codegen, safety) | `build_local_reply` (same order, same text) |
| anti-hallucination probes | unknown-person refusal + eval hallu-1/safety-1 phrasings | same |
