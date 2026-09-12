// Real on-disk DB-backed Storage for the web app. Lives in src/ but stays
// Node-type-free: SQLite is loaded via a dynamic import cast to `any` (Node 22's
// experimental `node:sqlite`). If it is unavailable, it falls back to the
// in-memory store so the app always boots.
//
// Run the host with NODE_OPTIONS=--experimental-sqlite to enable a real database.

import { PersistentStorage, type Storage } from './storage';

interface SqliteHandle {
  exec(sql: string): void;
  prepare(sql: string): { get: (...a: unknown[]) => unknown; all: (...a: unknown[]) => unknown[]; run: (...a: unknown[]) => { changes?: number } };
}

class SqliteStorage implements Storage {
  constructor(private db: SqliteHandle) {
    this.db.exec('CREATE TABLE IF NOT EXISTS kv (collection TEXT, key TEXT, value TEXT, PRIMARY KEY (collection, key))');
  }
  get<T>(collection: string, key: string): T | undefined {
    const row = this.db.prepare('SELECT value FROM kv WHERE collection=? AND key=?').get(collection, key) as { value: string } | undefined;
    return row ? (JSON.parse(row.value) as T) : undefined;
  }
  set<T>(collection: string, key: string, value: T): void {
    this.db.prepare('INSERT INTO kv (collection,key,value) VALUES (?,?,?) ON CONFLICT(collection,key) DO UPDATE SET value=excluded.value').run(collection, key, JSON.stringify(value));
  }
  delete(collection: string, key: string): boolean {
    return (this.db.prepare('DELETE FROM kv WHERE collection=? AND key=?').run(collection, key).changes ?? 0) > 0;
  }
  list<T>(collection: string): T[] {
    const rows = this.db.prepare('SELECT value FROM kv WHERE collection=?').all(collection) as Array<{ value: string }>;
    return rows.map((r) => JSON.parse(r.value) as T);
  }
  keys(collection: string): string[] {
    const rows = this.db.prepare('SELECT key FROM kv WHERE collection=?').all(collection) as Array<{ key: string }>;
    return rows.map((r) => r.key);
  }
}

/** Returns a real SQLite-backed Storage, or in-memory if SQLite is unavailable. */
export async function createSqliteStorage(file = ':memory:'): Promise<Storage> {
  try {
    const mod: any = await import('node:sqlite' as any);
    return new SqliteStorage(new mod.DatabaseSync(file));
  } catch {
    return new PersistentStorage();
  }
}
