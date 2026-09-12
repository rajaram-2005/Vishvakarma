# Aetherion Router

The routing boundary as its own service: **Request → Task Analysis → Model
Ranking → Model**. Pure functions, no I/O — trivially unit-testable and
cacheable. `services/api` embeds the same logic; when the system scales, the
api delegates to this service (HTTP) without contract change.

- `GET /models` — registry snapshot
- `POST /analyze` — `{text}` → intents (`code`, `math`, `long-context`, `creative`, `structured`)
- `POST /route` — `{text, requireLocal?, forceModel?}` → `{analysis, ranking, chosen}`

Ranking: capability match +12 · latency tier ±10/4/-4 · context headroom ·
cost · local bonus. Identical scoring to the web build (`@sutra/model-adapters`).
