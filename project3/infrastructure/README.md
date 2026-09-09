# SUTRA Infrastructure

Kubernetes, Docker and observability for the SUTRA stack. **Everything here is
optional** — the web app runs fully local with zero containers.

> CI lives at the **repository root** (`.github/workflows/sutra-ci.yml`) —
> GitHub Actions only reads workflows from the repo root. The copy in
> `project3/.github/workflows/ci.yml` is kept for repo-split portability and
> is ignored by GitHub while `project3/` is a subdirectory.

## Layout

| Path | Purpose |
|---|---|
| `Dockerfile.api` | service API image (python:3.11-slim, non-root, healthcheck) |
| `Dockerfile.web` | web image (node:20-alpine, Next.js standalone output) |
| `docker-compose.yml` | full local stack: web + api + postgres + redis + qdrant + otel + prometheus + grafana |
| `observability/` | OTel collector config, Prometheus scrape config, Grafana datasource |
| `k8s/` | namespace, deployment + service + ingress for web & api |
| `.env.example` | all env vars documented |

## Run the full stack

```bash
cd project3
cp infrastructure/.env.example .env   # then edit
docker compose -f infrastructure/docker-compose.yml up --build
```

- web: http://localhost:3000 · api: http://localhost:8000/docs
- grafana: http://localhost:3001 (admin / `GRAFANA_PASSWORD`)
- prometheus: http://localhost:9090
- OTLP ingest: 4317 (gRPC) / 4318 (HTTP)

## Observability

- Every api request produces spans (OTLP-compatible JSON, same shape as the
  web build). `OTLP_ENDPOINT` points the api at the collector.
- The collector batches + memory-limits, exports metrics to Prometheus;
  traces are buffered in-process (swap the exporter for Loki/Jaeger for
  persistence — one line in `otel-collector.yaml`).
- Grafana's Prometheus datasource is provisioned automatically.

## Notes

- `qdrant` is the vector store for RAG at scale; the api uses in-memory
  384-dim embeddings until you enable it (adapter boundary in
  `services/api` store layer).
- The web image is built with `SUTRA_STANDALONE=1` (Next.js standalone
  output, runs `node apps/web/server.js`); local `next start` builds use the
  default output — the flag is read in `apps/web/next.config.mjs`.
- `host.docker.internal` lets api reach an Ollama running on the host —
  the local-mode fast path with no model in the cluster.
