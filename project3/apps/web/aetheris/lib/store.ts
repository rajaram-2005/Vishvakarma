/**
 * Key-value store: one record keyed by (collection, id). Local default is the file backend
 * (data/<collection>.json); hosted/Vercel mode uses Postgres (Neon) with the same interface:
 *
 *   AETHERIS_STORE=postgres  +  POSTGRES_URL=...
 *
 * The backend is resolved per call (not at import) so tests can switch modes by setting env.
 */
import { fileStore, invalidateFileStoreCache } from "./store-files";
import { pgStore } from "./store-pg";

export type StoreBackend = typeof fileStore;

function backend(): StoreBackend {
  return process.env.AETHERIS_STORE === "postgres" ? pgStore : fileStore;
}

export const store: StoreBackend = {
  get: <T,>(name: string, id: string): Promise<T | undefined> => backend().get<T>(name, id),
  all: <T,>(name: string): Promise<Record<string, T>> => backend().all<T>(name),
  set: <T,>(name: string, id: string, value: T): Promise<void> => backend().set<T>(name, id, value),
  update: <T,>(name: string, id: string, fn: (cur: T | undefined) => T): Promise<T> => backend().update<T>(name, id, fn),
  remove: (name: string, id: string): Promise<void> => backend().remove(name, id),
};

/** Drop the read cache (file backend; the Postgres backend has no cache, so this is a no-op there). */
export function invalidateStoreCache(name?: string) {
  invalidateFileStoreCache(name);
}
