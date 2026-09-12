#!/usr/bin/env sh
# One-command production preview for Aetherion web.
# Self-heals after sandbox resets: installs deps and rebuilds when the
# (ephemeral) node_modules/.next are missing, then serves on 0.0.0.0:3000
# so the app is reachable through the live-preview proxy.
set -e
cd "$(dirname "$0")"

if [ ! -x node_modules/.bin/next ]; then
  echo "[preview] node_modules missing — installing…"
  npm install --no-audit --no-fund
fi

if [ ! -f apps/web/.next/BUILD_ID ]; then
  echo "[preview] .next build missing — building…"
  npm run build
fi

cd apps/web
exec ../../node_modules/.bin/next start -p 3000 -H 0.0.0.0
