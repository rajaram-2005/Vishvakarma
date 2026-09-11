# Aetherion — Deploy Guide

Aetherion is a **single Node.js app**: the UI, the embedded Aetheris intelligence
core (393 capabilities, agent pipeline, SSE chat) and the own-model family all
run from one process. Deploying it means running one container.

## 1 · Docker (any host)

```bash
cd project3
docker build -t aetherion .
docker run -p 3000:3000 aetherion
```

- The app: `http://localhost:3000`
- Health: `curl http://localhost:3000/api/status`
- Embedded core: `curl http://localhost:3000/api/health`
- Own models: `curl http://localhost:3000/api/localmodels`

Persist data (knowledge bases, memory, rooms) with a volume:

```bash
docker run -p 3000:3000 -v aetherion-data:/data -e AETHERIS_DATA_DIR=/data aetherion
```

## 2 · Render (one click)

`project3/render.yaml` is a Render Blueprint:

1. Push this repo to GitHub.
2. Render Dashboard → **New +** → **Blueprint** → select the repo.
   If Render asks for the root directory, set it to `project3`.
3. Render builds the Dockerfile, mounts a 1 GB disk at `/var/data`,
   and health-checks `/api/status`.

## 3 · Fly.io

```bash
cd project3
fly launch --copy-config --no-deploy   # or just edit fly.toml's app name
fly deploy
fly open
```

`fly.toml` is pre-configured: shared-cpu-1x, HTTP on port 3000, health check on
`/api/status`, and machines sleep at zero traffic (wake on request).

## 4 · Vercel / serverless caveat

Serverless platforms time out long-running SSE streams, so the **Docker paths
above are the supported deployment**. On Vercel the static UI still works, but
`/api/chat` (the core's streaming endpoint) can be cut off mid-stream.

## Environment

Everything optional — the app runs with zero configuration.

| Variable | Meaning |
| --- | --- |
| `AETHERIS_DATA_DIR` | Where the embedded core stores data (default: writable `data/`). Mount a volume in production. |
| `GROQ_API_KEY`, `GEMINI_API_KEY`, … | Optional keys for the Aetheris provider mesh (see Settings → API keys in-app for the full list; keyless providers work without any). |
| `NEXT_PUBLIC_APP_URL` | Optional canonical URL (used by the API docs page). |

## The public API

`/api/*` sends `Access-Control-Allow-Origin: *`, so any app or script can call
Aetherion as an online AI backend:

```bash
# one-shot answer from the embedded core (SSE stream)
curl -N -X POST https://YOUR-APP/api/chat \
  -H 'content-type: application/json' \
  -d '{"messages":[{"role":"user","content":"Explain monads briefly"}]}'

# the own-model family (deterministic, no keys, no tokens)
curl -X POST https://YOUR-APP/api/localmodels/chat \
  -H 'content-type: application/json' \
  -d '{"model":"aetherion-math","messages":[{"role":"user","content":"17 * 23 + 5"}]}'
```

See `docs/api.md` for the full endpoint list (health, capabilities, chat,
localmodels, status, agents, kb, twins, gallery, v1/*…).
