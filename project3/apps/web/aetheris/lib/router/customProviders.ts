/**
 * User-added providers — "add a provider by link" from Settings / the Providers page.
 *
 * A user provider is any OpenAI-compatible endpoint (Ollama, LM Studio, llama.cpp, LocalAI,
 * KoboldCpp, Jan, a hosted third-party gateway, …). Records live in <dataDir>/custom_providers.json;
 * an optional API key for one lives in the runtime key store under AETHERIS_USER_<SLUG>_KEY, so the
 * Settings key manager handles it like every other key. Providers apply instantly — no restart —
 * because the router reads this list on every candidate computation.
 *
 * Hosted/Vercel mode (`AETHERIS_STORE=postgres`) persists records in the shared store instead of
 * the file (one record per provider in the `custom_providers` collection). Same pattern as
 * runtimeKeys.ts: synchronous write-through cache, `hydrateCustomProviders()` refresh (awaited with
 * force on the management routes, TTL-gated elsewhere), throttled background refresh on reads.
 */
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { store } from "@/aetheris/lib/store";
import { record } from "@/aetheris/core/observability/events";
import type { ProviderConfig } from "./types";

export interface CustomProviderRecord {
  id: string;
  name: string;
  baseUrl: string;
  model: string;
  /** OpenAI-compatible wire protocol is the default (kind: "openai"). */
  vision: boolean;
  /** Runs on this machine / LAN — tried first, tagged local in the UI. */
  local: boolean;
  priority: number;
  notes?: string;
  createdAt: number;
  envKey: string;
}

export interface CustomProviderInput {
  name: string;
  baseUrl: string;
  model: string;
  vision?: boolean;
  local?: boolean;
  notes?: string;
}

const COLLECTION = "custom_providers";
const HYDRATE_TTL_MS = 30_000;

let cache: CustomProviderRecord[] | null = null;
let lastHydrate = 0;
let inflight: Promise<void> | null = null;

function dataDir(): string {
  return process.env.AETHERIS_DATA_DIR ?? path.join(process.cwd(), "data");
}
function file(): string {
  return path.join(dataDir(), "custom_providers.json");
}

/** Postgres store backend (hosted/Vercel path). Resolved per call so tests can switch modes by setting env. */
export const isCustomProviderStore = () => process.env.AETHERIS_STORE === "postgres";

function isRecord(r: unknown): r is CustomProviderRecord {
  return !!r && typeof r === "object" && typeof (r as CustomProviderRecord).id === "string" && typeof (r as CustomProviderRecord).baseUrl === "string";
}

function load(): CustomProviderRecord[] {
  if (cache) return cache;
  cache = [];
  if (isCustomProviderStore()) return cache; // the store is the source of truth; hydrate() fills this
  try {
    const raw = JSON.parse(readFileSync(file(), "utf8")) as unknown;
    if (Array.isArray(raw)) cache = raw.filter(isRecord);
  } catch {
    /* not created yet */
  }
  return cache;
}

function persistFile(): void {
  const list = load();
  if (list.length === 0) {
    try { rmSync(file(), { force: true }); rmSync(`${file()}.tmp`, { force: true }); } catch { /* ignore */ }
    return;
  }
  mkdirSync(dataDir(), { recursive: true });
  const tmp = `${file()}.tmp`;
  writeFileSync(tmp, JSON.stringify(list, null, 2), { mode: 0o600 });
  renameSync(tmp, file());
}

async function persistRecord(rec: CustomProviderRecord | undefined, id: string): Promise<void> {
  if (rec === undefined) await store.remove(COLLECTION, id);
  else await store.set(COLLECTION, id, rec);
}

/**
 * Refresh the cache from the store. No-op on the file backend. Never throws — a store outage must
 * degrade to the cached providers, not break the request; failures are recorded as telemetry.
 * Pass force from the provider-management routes so they always read fresh cross-instance state.
 */
export async function hydrateCustomProviders(force = false): Promise<void> {
  if (!isCustomProviderStore()) return;
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
      const all = await store.all<CustomProviderRecord>(COLLECTION);
      cache = Object.values(all).filter(isRecord);
      lastHydrate = Date.now();
    } catch (e) {
      record({ type: "error", capability: "router:hydrate-providers", ok: false, ms: 0, detail: `custom provider hydrate failed: ${(e as Error).message}` });
    } finally {
      inflight = null;
    }
  })();
  await inflight;
}

/** Throttled background refresh kicked off by sync reads so instances converge without awaiting. */
function refreshInBackground(): void {
  if (!isCustomProviderStore() || inflight || Date.now() - lastHydrate < HYDRATE_TTL_MS) return;
  void hydrateCustomProviders();
}

function slugify(name: string, taken: Set<string>): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32) || "provider";
  let slug = base;
  let n = 2;
  while (taken.has(slug)) slug = `${base}-${n++}`;
  return slug;
}

export function customEnvKey(slug: string): string {
  return `AETHERIS_USER_${slug.toUpperCase().replace(/-/g, "_")}_KEY`;
}

export function listCustomProviders(): CustomProviderRecord[] {
  refreshInBackground();
  return [...load()];
}

export function findCustomProvider(id: string): CustomProviderRecord | undefined {
  refreshInBackground();
  return load().find((p) => p.id === id);
}

/** Build the router-facing config for a user provider (keyless = usable with no key). */
export function toProviderConfig(r: CustomProviderRecord): ProviderConfig {
  return {
    id: r.id,
    name: r.name,
    kind: "openai",
    baseUrl: r.baseUrl.replace(/\/+$/, ""),
    envKey: r.envKey,
    model: r.model || "default",
    priority: r.priority,
    local: r.local,
    vision: r.vision,
    keyless: true, // reachable endpoint is enough; a stored key raises limits/auth
    costClass: r.local ? "local" : "free",
    contextTokens: 128_000,
    strengths: r.local ? ["coding", "reasoning", "fast"] : undefined,
    notes: r.notes ?? (r.local ? "Added in Settings → API keys. Runs locally." : "Added by link in Settings → API keys."),
    custom: true,
  };
}

function buildRecord(input: CustomProviderInput, taken: Set<string>): CustomProviderRecord {
  const slug = slugify(input.name, taken);
  return {
    id: `user-${slug}`,
    name: input.name.trim().slice(0, 60),
    baseUrl: input.baseUrl.trim().replace(/\/+$/, ""),
    model: input.model.trim().slice(0, 120) || "default",
    vision: !!input.vision,
    local: !!input.local,
    priority: input.local ? 0 : 1,
    notes: input.notes?.trim().slice(0, 240),
    createdAt: Date.now(),
    envKey: customEnvKey(slug),
  };
}

function persistAfterWrite(rec: CustomProviderRecord | undefined, id: string): void {
  if (isCustomProviderStore()) {
    persistRecord(rec, id).catch((e) => record({ type: "error", capability: "router:persist-provider", ok: false, ms: 0, detail: `custom provider persist failed: ${(e as Error).message}` }));
    return;
  }
  persistFile();
}

export function addCustomProvider(input: CustomProviderInput): CustomProviderRecord {
  const list = load();
  const rec = buildRecord(input, new Set(list.map((p) => p.id)));
  list.push(rec);
  persistAfterWrite(rec, rec.id);
  return rec;
}

/** Async twin: awaits the store write (throws on failure — routes map it to 500). */
export async function addCustomProviderAsync(input: CustomProviderInput): Promise<CustomProviderRecord> {
  const list = load();
  const rec = buildRecord(input, new Set(list.map((p) => p.id)));
  list.push(rec);
  if (isCustomProviderStore()) await persistRecord(rec, rec.id);
  else persistFile();
  return rec;
}

function applyPatch(cur: CustomProviderRecord, patch: Partial<CustomProviderInput>): CustomProviderRecord {
  const next: CustomProviderRecord = { ...cur };
  if (patch.name?.trim()) next.name = patch.name.trim().slice(0, 60);
  if (patch.baseUrl?.trim()) next.baseUrl = patch.baseUrl.trim().replace(/\/+$/, "");
  if (patch.model !== undefined) next.model = (patch.model || "default").trim().slice(0, 120);
  if (patch.vision !== undefined) next.vision = !!patch.vision;
  if (patch.local !== undefined) { next.local = !!patch.local; next.priority = patch.local ? 0 : 1; }
  if (patch.notes !== undefined) next.notes = patch.notes?.trim().slice(0, 240);
  return next;
}

export function updateCustomProvider(id: string, patch: Partial<CustomProviderInput>): CustomProviderRecord | undefined {
  const list = load();
  const i = list.findIndex((p) => p.id === id);
  if (i < 0) return undefined;
  const next = applyPatch(list[i]!, patch);
  list[i] = next;
  persistAfterWrite(next, id);
  return next;
}

/** Async twin: awaits the store write (throws on failure — routes map it to 500). */
export async function updateCustomProviderAsync(id: string, patch: Partial<CustomProviderInput>): Promise<CustomProviderRecord | undefined> {
  const list = load();
  const i = list.findIndex((p) => p.id === id);
  if (i < 0) return undefined;
  const next = applyPatch(list[i]!, patch);
  list[i] = next;
  if (isCustomProviderStore()) await persistRecord(next, id);
  else persistFile();
  return next;
}

export function removeCustomProvider(id: string): boolean {
  const list = load();
  const next = list.filter((p) => p.id !== id);
  if (next.length === list.length) return false;
  cache = next;
  persistAfterWrite(undefined, id);
  return true;
}

/** Async twin: awaits the store write (throws on failure — routes map it to 500). */
export async function removeCustomProviderAsync(id: string): Promise<boolean> {
  const list = load();
  const next = list.filter((p) => p.id !== id);
  if (next.length === list.length) return false;
  cache = next;
  if (isCustomProviderStore()) await persistRecord(undefined, id);
  else persistFile();
  return true;
}

/** Tests only. */
export function resetCustomProviderCacheForTests(): void {
  cache = null;
  lastHydrate = 0;
}
