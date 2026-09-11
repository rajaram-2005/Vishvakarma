/**
 * File JSON store backend (data/<collection>.json). The local default: single-instance,
 * zero dependencies, atomic writes. Implements the StoreBackend interface in ./store.
 */
import { promises as fs } from "node:fs";
import path from "node:path";

// Read the data dir lazily so test files that set process.env.AETHERIS_DATA_DIR
// at module top-of-file (and may be loaded after other test files that already
// imported this module) get a fresh per-test directory. The previous `const
// DIR = ...` was evaluated once at module load time, which leaked test data
// from the first test file's mkdtemp into later test files.
function dir(): string { return process.env.AETHERIS_DATA_DIR ?? path.join(process.cwd(), "data"); }
// If the data dir changes between calls (test setup), blow the cache so we
// don't return stale entries from the previous dir.
let lastDir = dir();
function dirChanged(): boolean { const d = dir(); if (d !== lastDir) { lastDir = d; cache.clear(); return true; } return false; }
const locks = new Map<string, Promise<unknown>>();

// Perf (Phase 19): in-process read cache per collection keyed by file mtime. Hot reads (telemetry, devices,
// jobs, events) no longer re-parse JSON on every call. Writes stay write-through and atomic (tmp + rename)
// so a crash never loses an acknowledged write; the cache is refreshed from the written data.
const cache = new Map<string, { mtimeMs: number; data: Record<string, unknown> }>();
const fileOf = (name: string) => path.join(dir(), `${name}.json`);

async function readAll<T>(name: string): Promise<Record<string, T>> {
  dirChanged();
  const file = fileOf(name);
  try {
    const st = await fs.stat(file); const c = cache.get(name);
    if (c && c.mtimeMs === st.mtimeMs) return c.data as Record<string, T>;
    const data = JSON.parse(await fs.readFile(file, "utf8")) as Record<string, T>;
    cache.set(name, { mtimeMs: st.mtimeMs, data }); return data;
  } catch { return {}; }
}
async function writeAll<T>(name: string, data: Record<string, T>) {
  dirChanged();
  await fs.mkdir(dir(), { recursive: true });
  const file = fileOf(name);
  await fs.writeFile(file + ".tmp", JSON.stringify(data, null, 2));
  await fs.rename(file + ".tmp", file);
  let mtimeMs = 0; try { mtimeMs = (await fs.stat(file)).mtimeMs; } catch { /* ignore */ }
  cache.set(name, { mtimeMs, data: data as Record<string, unknown> });
}
/** Drop the read cache (tests / external edits). */
export function invalidateFileStoreCache(name?: string) { if (name) cache.delete(name); else cache.clear(); }

/** Serialise mutations per collection. */
function withLock<R>(name: string, fn: () => Promise<R>): Promise<R> {
  const prev = locks.get(name) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  locks.set(name, next.catch(() => undefined));
  return next;
}

export const fileStore = {
  async get<T>(name: string, id: string): Promise<T | undefined> {
    return (await readAll<T>(name))[id];
  },
  async all<T>(name: string): Promise<Record<string, T>> {
    return readAll<T>(name);
  },
  async set<T>(name: string, id: string, value: T): Promise<void> {
    return withLock(name, async () => {
      const all = await readAll<T>(name);
      all[id] = value;
      await writeAll(name, all);
    });
  },
  async update<T>(name: string, id: string, fn: (cur: T | undefined) => T): Promise<T> {
    return withLock(name, async () => {
      const all = await readAll<T>(name);
      const v = fn(all[id]);
      all[id] = v;
      await writeAll(name, all);
      return v;
    });
  },
  async remove(name: string, id: string): Promise<void> {
    return withLock(name, async () => {
      const all = await readAll(name);
      delete all[id];
      await writeAll(name, all);
    });
  },
};
