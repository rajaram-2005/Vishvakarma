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
import { Platform, PersistentStorage, AuthService, registryFromEnv, adapterExecutor, createWebApp } from './src/index';
import type { Storage } from './src/storage';
import type { WebRequest } from './src/web';

const PORT = Number(process.env.PORT ?? 4789);
const DATA_DB = process.env.STUDIO_DB; // sqlite file path

/** Build a real DB-backed store, falling back to in-memory if SQLite is absent. */
async function makeStorage(dbPath?: string): Promise<Storage> {
  if (dbPath && dbPath !== ':memory:') {
    try {
      const mod: any = await import('node:sqlite');
      const db = new mod.DatabaseSync(dbPath);
      db.exec('CREATE TABLE IF NOT EXISTS kv (collection TEXT, key TEXT, value TEXT, PRIMARY KEY (collection, key))');
      return {
        get<T>(c: string, k: string): T | undefined {
          const r = db.prepare('SELECT value FROM kv WHERE collection=? AND key=?').get(c, k) as { value: string } | undefined;
          return r ? (JSON.parse(r.value) as T) : undefined;
        },
        set<T>(c: string, k: string, v: T): void {
          db.prepare('INSERT INTO kv (collection,key,value) VALUES (?,?,?) ON CONFLICT(collection,key) DO UPDATE SET value=excluded.value').run(c, k, JSON.stringify(v));
        },
        delete(c: string, k: string): boolean {
          return (db.prepare('DELETE FROM kv WHERE collection=? AND key=?').run(c, k).changes ?? 0) > 0;
        },
        list<T>(c: string): T[] {
          return (db.prepare('SELECT value FROM kv WHERE collection=?').all(c) as Array<{ value: string }>).map((r) => JSON.parse(r.value) as T);
        },
        keys(c: string): string[] {
          return (db.prepare('SELECT key FROM kv WHERE collection=?').all(c) as Array<{ key: string }>).map((r) => r.key);
        },
      };
    } catch {
      // fall through
    }
  }
  return new PersistentStorage();
}

async function bootstrap() {
  const storage = await makeStorage(DATA_DB);
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
