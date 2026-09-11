# Aetherion Marketplace

Catalog + **scope-reviewed installs**. Every item declares scopes; installing
requires explicitly granting them — a request without full grant returns
`409 scopes_not_granted` (scopes can never be silently implied). Uninstall
revokes scopes immediately.

- `GET /catalog?kind=skill|plugin|workflow|mcp|model`
- `POST /install/{id}` — `{grantedScopes: [...]}` → registry entry
- `DELETE /install/{id}` — uninstall
- `GET /installed`
- `GET /health`

The web app's Marketplace surface talks to this service; the item definitions
mirror `apps/web/lib/catalog.ts`.
