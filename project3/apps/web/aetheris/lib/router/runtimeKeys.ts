/**
 * Runtime provider-key store — keys added from the Settings UI instead of .env.
 *
 * Keys live in <dataDir>/runtime_keys.json (mode 0600, same directory as the rest of the
 * server records). A key set here overrides the same env var from .env for the whole instance,
 * with no restart: provider resolution reads this store synchronously on every request.
 *
 * Scope matches the .env semantics it replaces: instance-wide, not per browser/uid. Removing a
 * runtime key falls back to .env (if present) transparently.
 *
 * Hosted/Vercel mode (`AETHERIS_STORE=postgres`) persists keys in the shared store instead of the
 * file (one record per key in the `runtime_keys` collection), because serverless instances have no
 * shared disk. The read path stays synchronous — a write-through in-memory cache — and
 * `hydrateRuntimeKeys()` refreshes it from the store: awaited with force on the key-management
 * routes and TTL-gated (30s) on the hot paths, plus a throttled background refresh on every read
 * so long-lived instances converge without a restart. NOTE: keys stored in the local file are NOT
 * migrated automatically — re-add them once via Settings after switching backends.
 */
import { readFileSync, renameSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { store } from "@/aetheris/lib/store";
import { record } from "@/aetheris/core/observability/events";

const COLLECTION = "runtime_keys";
/** Refresh the cache from the store at most this often on the hot paths (keys change rarely). */
const HYDRATE_TTL_MS = 30_000;

/** Resolved lazily so tests can point AETHERIS_DATA_DIR at a fresh temp dir per process. */
function dataDir(): string {
  return process.env.AETHERIS_DATA_DIR ?? path.join(process.cwd(), "data");
}
function file(): string {
  return path.join(dataDir(), "runtime_keys.json");
}

/** Postgres store backend (hosted/Vercel path). Resolved per call so tests can switch modes by setting env. */
export const isRuntimeKeyStore = () => process.env.AETHERIS_STORE === "postgres";

let cache: Map<string, string> | null = null;
let lastHydrate = 0;
let inflight: Promise<void> | null = null;

function load(): Map<string, string> {
  if (cache) return cache;
  cache = new Map();
  if (isRuntimeKeyStore()) return cache; // the store is the source of truth; hydrate() fills this
  try {
    const raw = JSON.parse(readFileSync(file(), "utf8")) as Record<string, unknown>;
    for (const [k, v] of Object.entries(raw)) if (typeof v === "string" && v.trim()) cache.set(k, v.trim());
  } catch {
    /* not created yet — fine */
  }
  return cache;
}

function persistFile(): void {
  const map = load();
  if (map.size === 0) {
    // Nothing stored — leave no key file behind.
    try { rmSync(file(), { force: true }); rmSync(`${file()}.tmp`, { force: true }); } catch { /* ignore */ }
    return;
  }
  mkdirSync(dataDir(), { recursive: true });
  const body = JSON.stringify(Object.fromEntries(map), null, 2);
  const tmp = `${file()}.tmp`;
  writeFileSync(tmp, body, { mode: 0o600 });
  renameSync(tmp, file());
}

async function persistKey(envVar: string, key: string | undefined): Promise<void> {
  if (key === undefined) await store.remove(COLLECTION, envVar);
  else await store.set(COLLECTION, envVar, { key });
}

/**
 * Refresh the cache from the store. No-op on the file backend. Never throws — a store outage must
 * degrade to the cached keys (and .env), not break the request; failures are recorded as telemetry.
 * Pass force from the key-management routes so they always read fresh cross-instance state.
 */
export async function hydrateRuntimeKeys(force = false): Promise<void> {
  if (!isRuntimeKeyStore()) return;
  for (;;) {
    if (!force && Date.now() - lastHydrate < HYDRATE_TTL_MS) return;
    if (!inflight) break;
    // Someone else is refreshing: wait for them, then — for force — loop around and fetch our own
    // fresh copy instead of returning possibly-stale data (the refresh we waited for may predate us
    // or have failed outright).
    await inflight;
    if (!force) return;
  }
  inflight = (async () => {
    try {
      const all = await store.all<{ key: unknown }>(COLLECTION);
      const next = new Map<string, string>();
      for (const [k, v] of Object.entries(all)) {
        const key = (v as { key?: unknown } | null)?.key;
        if (typeof key === "string" && key.trim()) next.set(k, key.trim());
      }
      cache = next;
      lastHydrate = Date.now();
    } catch (e) {
      record({ type: "error", capability: "router:hydrate-keys", ok: false, ms: 0, detail: `runtime key hydrate failed: ${(e as Error).message}` });
    } finally {
      inflight = null;
    }
  })();
  await inflight;
}

/** Throttled background refresh kicked off by sync reads so instances converge without awaiting. */
function refreshInBackground(): void {
  if (!isRuntimeKeyStore() || inflight || Date.now() - lastHydrate < HYDRATE_TTL_MS) return;
  void hydrateRuntimeKeys();
}

/** Trimmed runtime key for an env var, or undefined when none was added in the app. */
export function runtimeKeyFor(envVar: string): string | undefined {
  refreshInBackground();
  const v = load().get(envVar);
  return v || undefined;
}

/**
 * Resolve a configuration value the way the app reads it everywhere: in-app runtime override
 * first (Settings → API keys), then .env. Use this instead of touching `process.env` directly
 * so features pick up keys added from the UI without a restart.
 */
export function resolvedEnv(envVar: string): string | undefined {
  const env = process.env[envVar];
  return runtimeKeyFor(envVar) ?? (env && env.trim() ? env.trim() : undefined);
}

/** All runtime keys as { envVar, key } — for the management UI. */
export function listRuntimeKeys(): { envVar: string; key: string }[] {
  refreshInBackground();
  return [...load().entries()].map(([envVar, key]) => ({ envVar, key }));
}

/** Set (or clear when empty) a runtime override. Synchronous on purpose: tiny file, rare writes. */
export function setRuntimeKey(envVar: string, key: string): void {
  const clean = key.trim();
  if (clean) load().set(envVar, clean);
  else load().delete(envVar);
  if (isRuntimeKeyStore()) {
    // The cache is already correct for this instance; the store write follows. Routes that must
    // confirm the write use setRuntimeKeyAsync.
    persistKey(envVar, clean || undefined).catch((e) => record({ type: "error", capability: "router:persist-key", ok: false, ms: 0, detail: `runtime key persist failed: ${(e as Error).message}` }));
    return;
  }
  persistFile();
}

/** Async twin: updates the cache and awaits the store write (throws on failure — routes map it to 500). */
export async function setRuntimeKeyAsync(envVar: string, key: string): Promise<void> {
  const clean = key.trim();
  if (clean) load().set(envVar, clean);
  else load().delete(envVar);
  if (isRuntimeKeyStore()) await persistKey(envVar, clean || undefined);
  else persistFile();
}

/** Tests only: forget the cached state so a new AETHERIS_DATA_DIR / store takes effect. */
export function resetRuntimeKeyCacheForTests(): void {
  cache = null;
  lastHydrate = 0;
}
