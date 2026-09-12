#!/usr/bin/env tsx
// @sutra/orchestration — Unified AI Studio web application server.
//
// Thin Node adapter: HTTP + file/DB I/O. Delegates all business logic to the ONE
// CORE via createWebApp(). Backed by real infrastructure:
//   - SQLite (node:sqlite) when run with NODE_OPTIONS=--experimental-sqlite,
//     otherwise an in-memory store (so the server always boots).
//   - Authentication (sessions + scoped API keys + RBAC)
//   - Live model/plugin/MCP adapters seeded from the environment
//
//   NODE_OPTIONS=--experimental-sqlite tsx server.ts   # http://localhost:4789

import { createServer } from 'node:http';
import { Platform, AuthService, registryFromEnv, adapterExecutor, createWebApp, createStorageFromUrl } from './src/index';
import type { WebRequest } from './src/web';

const PORT = Number(process.env.PORT ?? 4789);
const DATA_DB = process.env.STUDIO_DB; // sqlite file path, or postgres://... URL

async function bootstrap() {
  const storage = await createStorageFromUrl(DATA_DB ?? ':memory:');
  const auth = new AuthService(storage);
  const adapters = registryFromEnv();
  const defaultModel = adapters.listModels()[0]?.id ?? 'openai';
  const platform = new Platform({
    seedSample: true,
    storage,
    executor: adapters.listModels().length ? adapterExecutor(adapters, defaultModel) : undefined,
  });
  const handle = createWebApp({ platform, storage, auth, adapters });

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      const chunks: Buffer[] = [];
      if (req.method === 'POST' || req.method === 'PUT') {
        for await (const c of req) chunks.push(c as Buffer);
      }
      const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString() || 'null') : null;
      const out = await handle({
        method: req.method ?? 'GET',
        path: url.pathname,
        query: url.searchParams,
        body,
        auth: req.headers['authorization'],
      } as WebRequest);
      const headers = { 'content-type': 'application/json', ...(out.headers ?? {}) };
      res.writeHead(out.status, headers);
      res.end(out.html ?? JSON.stringify(out.json ?? ''));
    } catch (e) {
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: String(e instanceof Error ? e.message : e) }));
    }
  });

  server.listen(PORT, () => {
    const mode = adapters.listModels().length ? `live adapters (${adapters.listModels().length})` : 'demo executor';
    process.stdout.write(`Unified AI Studio ONE CORE on http://localhost:${PORT} [${mode}]\n`);
  });
}

void bootstrap();
