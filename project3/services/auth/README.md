# SUTRA Auth

Local-first identity service. Stdlib-only (HMAC-SHA256 tokens, PBKDF2 password
hashing with salt/pepper). No external IdP is required — cloud IdP adapters
(OAuth2/OIDC) slot in behind the same endpoints for hybrid mode.

- `POST /users` — register (email + password ≥ 8) → token
- `POST /login` — token
- `GET /me` — bearer-token identity
- `DELETE /sessions/current` — revoke session (token becomes invalid immediately)
- `GET /health`

State: JSON under `SUTRA_DATA_DIR`. Split boundary from `services/api`:
`api` performs capability gating; `auth` performs identity & sessions.
