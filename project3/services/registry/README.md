# SUTRA Registry

Manifest-first registry for **skills, plugins, workflows, MCP servers, model
presets**. Nothing is published without a valid manifest (id, name, semver
version, entry, license) and known scopes.

- `GET /items?kind=skill|plugin|workflow|mcp|model`
- `POST /items` — `{kind, manifest}` → validated & stored (422 with errors otherwise)
- `DELETE /items/{id}`
- `POST /validate` — `{manifest}` → `{valid, errors, scopes}`
- `GET /health`

Scopes come from the shared vocabulary (`fs.*`, `terminal.exec`, `network`,
`db`, `secrets`, `deploy`, `memory.write`, `browser`). The marketplace
service and the web app both read this registry.
