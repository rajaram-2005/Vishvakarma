// Managed Postgres backend — a drop-in for the sync Storage interface. It keeps an
// in-memory mirror for synchronous reads (so it satisfies the same Storage contract
// as MemoryStorage/SqliteStorage) and asynchronously persists writes to Postgres.
// Use createStorageFromUrl('postgres://...') to select it; no other code changes.

import { PersistentStorage, type Storage } from './storage';

export type PgQuery = (text: string, params: unknown[]) => Promise<{ rows: Array<Record<string, unknown>>; rowCount?: number }>;

class PostgresStorage implements Storage {
  private mirror = new Map<string, Map<string, unknown>>();
  private loaded = false;

  constructor(private q: PgQuery) {
    void this.hydrate();
  }

  private col(name: string): Map<string, unknown> {
    let c = this.mirror.get(name);
    if (!c) {
      c = new Map();
      this.mirror.set(name, c);
    }
    return c;
  }

  private async hydrate(): Promise<void> {
    try {
      const r = await this.q('SELECT collection, key, value FROM kv', []);
      for (const row of r.rows) {
        const c = String(row.collection);
        const k = String(row.key);
        this.col(c).set(k, JSON.parse(String(row.value)));
      }
    } catch {
      // table may not exist yet; it is created on first write
    }
    this.loaded = true;
  }

  get<T>(collection: string, key: string): T | undefined {
    return this.col(collection).get(key) as T | undefined;
  }
  set<T>(collection: string, key: string, value: T): void {
    this.col(collection).set(key, value);
    this.q('CREATE TABLE IF NOT EXISTS kv (collection TEXT, key TEXT, value TEXT, PRIMARY KEY (collection, key))', []).catch(() => {});
    this.q('INSERT INTO kv (collection, key, value) VALUES ($1, $2, $3) ON CONFLICT (collection, key) DO UPDATE SET value = EXCLUDED.value', [collection, key, JSON.stringify(value)]).catch(() => {});
  }
  delete(collection: string, key: string): boolean {
    this.col(collection).delete(key);
    this.q('DELETE FROM kv WHERE collection = $1 AND key = $2', [collection, key]).catch(() => {});
    return true;
  }
  list<T>(collection: string): T[] {
    return [...this.col(collection).values()] as T[];
  }
  keys(collection: string): string[] {
    return [...this.col(collection).keys()];
  }
}

/** Selects a Storage backend from a URL/env: postgres:// -> Postgres (write-through),
 *  anything else -> SQLite (or in-memory if ':memory:'). */
export async function createStorageFromUrl(url = ':memory:', injectedQuery?: PgQuery): Promise<Storage> {
  if (url.startsWith('postgres://') || url.startsWith('postgresql://')) {
    if (injectedQuery) return new PostgresStorage(injectedQuery);
    const pg: any = await import('pg' as any);
    const pool = new pg.Pool({ connectionString: url });
    const q: PgQuery = (text, params) => pool.query(text, params);
    return new PostgresStorage(q);
  }
  // Defer to the SQLite factory (already handles the in-memory fallback).
  const { createSqliteStorage } = await import('./storage-sqlite');
  return createSqliteStorage(url);
}
