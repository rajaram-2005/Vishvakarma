# SUTRA Agent

Runs the canonical 8-step agent loop as a service:
**Understand → Plan → Tools → Execute → Observe → Verify → Repair → Finalize.**

Each agent has declared **permissions** (tool categories) and a **sandbox**
class; every tool call in a run is gateway-checked (same policy as
`services/security`). Runs persist locally with their per-step report.

- `GET /agents` · `GET /agents/{id}` — registry (7 agents, permissions, sandbox)
- `POST /agents/{id}/run` — `{goal}` → 8-step run with report
- `GET /runs` — history
- `GET /health`

Team orchestration (sequential handoffs, sub-agents) lives in the web app's
Teams surface today; this service is the unit boundary it delegates to.
