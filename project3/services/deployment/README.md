# Aetherion Deployment

Deployment boundary: **local · Docker · Puter cloud**.

- `POST /deploy` — `{target, name?, files: {path: content}}`
  1. **secret scan** — any secret pattern ⇒ `409 secrets_detected` (bundle never ships)
  2. bundle written to `data/bundles/<id>/` with a manifest + SHA-256 hash
  3. Docker target generates a `Dockerfile` (node:20-alpine, healthcheck)
  4. Puter target requires an explicit connection (`PUTER_JWT` or a client
     sign-in) — **local mode is never forced** and never silently uploads
- `GET /deployments` — history
- `GET /health`
