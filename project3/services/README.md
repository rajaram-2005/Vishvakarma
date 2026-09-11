# Aetherion Services

Provider-neutral service boundary of the Aetherion workspace. Every service is a
small FastAPI app with local-first JSON persistence, the same deterministic
contracts as `packages/shared`, and a `/health` endpoint.

| Service | Boundary | Key endpoints |
|---|---|---|
| **api** | primary backend (models, route, chat SSE, RAG, security, workflows, tasks, deploy, traces) | see [api/README](api/README.md) |
| **auth** | identity & sessions (local JWT) | `/users` `/login` `/me` |
| **router** | Request → Analysis → Ranking → Model | `/route` `/analyze` |
| **agent** | 8-step agent loop, permissions, sandbox | `/agents/{id}/run` |
| **registry** | manifest-first catalog of skills/plugins/workflows/MCP | `/items` `/validate` |
| **discovery** | local runtimes + MCP servers health | `/runtimes` `/mcp` |
| **evaluation** | benchmark suite + full metrics | `/run` |
| **memory** | scoped semantic memory (WHAT) | `/search` |
| **rag** | ingest → chunk → embed → retrieve → cite | `/ingest` `/query` |
| **security** | policy, approvals, session grants, audit | `/assess` `/approvals` |
| **deployment** | local / docker / puter, secret-gated bundles | `/deploy` |
| **marketplace** | catalog + explicit scope grants | `/install/{id}` |

## Run one

```bash
cd services/<name>
python3 -m uvicorn app:app --host 0.0.0.0 --port 8101   # any port
```

`services/api` is the canonical surface (32 tests under `services/api/tests/`);
the others are the split boundaries it delegates to as the system scales.
All share: env-driven config, JSON state under a service-local `data/`,
no external database required, and the **never-silently** rules
(dangerous ⇒ approval; local mode ⇒ no public egress; secrets ⇒ masked).

## In production

`infrastructure/docker-compose.yml` runs the full stack: web + api +
PostgreSQL + Redis + Qdrant + OTEL collector + Prometheus + Grafana.
K8s manifests are in `infrastructure/k8s/`.
