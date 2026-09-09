# SUTRA Security

The enforcement boundary: **Agent → Tool Gateway → Policy → Sandbox → Execution.**

- `GET /policy` — the 12-category policy matrix (Low/Medium/High/Critical)
- `POST /assess` — `{category, detail}` → risk + reasons (dangerous signatures
  escalate to **critical**: recursive delete, sudo, force push, destructive SQL, …)
- `POST /scan` — secret scan (location + kind only — never the secret)
- `POST /approvals` — create a pending approval request
- `POST /approvals/{id}/resolve` — `{decision: once|session|deny|inspect}`
  - `once` — this action only
  - `session` — grant the category for the session (revocable: `DELETE /session/{category}`)
  - `inspect` — allow after human inspection (recorded)
- `GET /approvals?status=pending` · `GET /session` · `GET /audit`
- `GET /health`

**Critical risk is never masked by a session grant** — the same rule as the
web app and the tool gateway.
