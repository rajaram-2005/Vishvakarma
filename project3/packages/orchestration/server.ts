#!/usr/bin/env tsx
// @sutra/orchestration — Unified AI Studio web application server.
//
// Thin Node adapter: it provides the HTTP + file I/O glue and delegates all
// business logic to the ONE CORE via createWebApp(). State persists to a JSON
// file so Library / schedules / chats survive restarts.
//
//   tsx server.ts            # http://localhost:4789

import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { Platform } from './src/index';
import { PersistentStorage } from './src/storage';
import { createWebApp } from './src/web';

const PORT = Number(process.env.PORT ?? 4789);
const DATA_FILE = process.env.STUDIO_DATA ?? join(process.cwd(), '.studio-data.json');

async function loadData(): Promise<Record<string, Record<string, unknown>>> {
  try {
    return JSON.parse(await readFile(DATA_FILE, 'utf8'));
  } catch {
    return {};
  }
}

const saveData = async (data: Record<string, Record<string, unknown>>): Promise<void> => {
  await mkdir(dirname(DATA_FILE), { recursive: true });
  await writeFile(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
};

const storage = new PersistentStorage({ load: loadData, save: saveData });
const platform = new Platform({ seedSample: true, storage });
const handle = createWebApp({ platform, storage });

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
    });
    const headers = { 'content-type': 'application/json', ...(out.headers ?? {}) };
    res.writeHead(out.status, headers);
    res.end(out.html ?? JSON.stringify(out.json ?? ''));
  } catch (e) {
    res.writeHead(500, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: String(e instanceof Error ? e.message : e) }));
  }
});

server.listen(PORT, () => {
  process.stdout.write(`Unified AI Studio ONE CORE listening on http://localhost:${PORT}\n`);
});
