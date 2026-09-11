# Aetherion Plugins

Example plugins, **manifest-first**. A plugin cannot enable until its
manifest passes validation and every declared scope is explicitly granted —
see the Marketplace surface or `services/marketplace` (`POST /install/{id}`
without `grantedScopes` returns `409 scopes_not_granted`).

## vault-secrets (example)

Read-only vault bridge. Scopes: `secrets` (read via gateway — every secret
read is a **critical** action and asks the human), `fs.read`.

## Layout

```
plugins/
├── README.md
└── vault-secrets/
    ├── manifest.json     # id, name, version, author, license, scopes, entry
    ├── index.ts          # entry point (tool registration)
    └── README.md
```
