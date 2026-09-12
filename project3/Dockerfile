# Aetherion — one container, one app.
# UI + embedded Aetheris core (/api/*) + own-model family (/api/localmodels/*)
# all run from this single Node.js image. Build with:
#   docker build -t aetherion .
#   docker run -p 3000:3000 aetherion

FROM node:22-alpine AS build
WORKDIR /app

# npm-workspaces monorepo: the web app + the shared packages.
COPY package.json package-lock.json ./
COPY packages ./packages
COPY apps/web ./apps/web
RUN npm ci --no-audit --no-fund

WORKDIR /app/apps/web
ARG NEXT_TELEMETRY_DISABLED=1
ENV NEXT_TELEMETRY_DISABLED=1 Aetherion_STANDALONE=1
RUN npm run build

# ── runtime ─────────────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
WORKDIR /app

COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public

EXPOSE 3000
HEALTHCHECK --interval=20s --timeout=5s --start-period=25s \
  CMD wget -qO- http://127.0.0.1:3000/api/status >/dev/null || exit 1

CMD ["node", "apps/web/server.js"]
