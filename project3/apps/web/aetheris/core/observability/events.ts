/**
 * Observability — one structured event stream for model, agent, tool, MCP, permission, schedule
 * and device events.
 *
 * Two layers, both always on:
 *  • an in-memory ring buffer (`AETHERIS_EVENT_BUFFER`, default 5000) for fast reads
 *  • a durable append log in SQLite (`node:sqlite`, zero deps) so telemetry survives a restart.
 *    The tail is loaded back into the buffer on first use, rows are capped at `AETHERIS_EVENT_MAX`
 *    (default 50 000) and the write is synchronous but tiny; set `AETHERIS_EVENT_PERSIST=0` to run
 *    in-memory only. Any failure to open the database degrades to the ring buffer rather than
 *    breaking the request that happened to emit an event.
 *
 * The Control Center reads `summary()` and `query()`.
 *
 * Hosted/Vercel mode (`AETHERIS_EVENTS=postgres` + `POSTGRES_URL=...`) swaps the durable log for
 * Postgres (events-pg.ts). `record()` stays synchronous — the ring buffer and counters update inline
 * and the row insert is fire-and-forget — while reads go through the `queryAsync()`/`summaryAsync()`/
 * `loadPersistedAsync()`/`eventStoreStatusAsync()`/`clearAsync()` mirrors, which merge durable rows
 * with this instance's buffer. The sync readers keep working in pg mode but only see this instance's
 * buffer (they cannot block on the network); every route and page already uses the async mirrors.
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { clearEventsPg, countEventsPg, insertEventPg, queryEventsPg } from "./events-pg";

/** Postgres durable log (hosted/Vercel path). Resolved per call so tests can switch modes by setting env. */
export const isPgEvents = () => process.env.AETHERIS_EVENTS === "postgres";
/** In-flight pg inserts. `record()` never awaits them; tests drain them with `__flushPgEventsForTests()`. */
const pendingPg = new Set<Promise<unknown>>();
/** Tests only: wait for every fire-and-forget pg insert emitted so far. */
export async function __flushPgEventsForTests(): Promise<void> {
  while (pendingPg.size) await Promise.allSettled([...pendingPg]);
}
export type EventType = "model" | "agent" | "tool" | "mcp" | "permission" | "execution" | "schedule" | "device" | "knowledge" | "memory" | "auth" | "error";
export interface AetherisEvent { id: string; at: number; type: EventType; uid?: string; capability?: string; ok: boolean; ms?: number; detail?: string; meta?: Record<string, unknown> }

/**
 * These four are configuration, so they are read when they are used — not when this module happens to
 * be imported. A module-load-time `const` freezes whatever the environment held at import time, which
 * silently sends every process started from the same working directory into one shared
 * `data/telemetry.sqlite`, no matter what `AETHERIS_DATA_DIR` is set to afterwards.
 *
 * That is not a theoretical concern: it is what made `npm test` fail on GitHub runners while passing
 * locally. `node --test` runs test files in parallel there (concurrency follows the CPU count — three
 * at a time on a 4-CPU runner), and every test file sets `AETHERIS_DATA_DIR` *after* importing this
 * module. All of them therefore shared one durable log, and each process's first read pulled another
 * process's events into its own report, inside the `{ sinceMs }` window that was supposed to scope it:
 *
 *     not ok - trace: per-group totalMs is the sum of step ms
 *       Expected values to be strictly equal: 340 !== 300
 *
 * `src/lib/store.ts` and `src/lib/router/runtimeKeys.ts` already resolve the data directory lazily for
 * exactly this reason; this module was the outlier. See tests/data-dir-isolation.test.ts.
 */
const MAX = () => Number(process.env.AETHERIS_EVENT_BUFFER ?? 5000);
/** Hard cap on retained durable rows. */
const PERSIST_MAX = () => Number(process.env.AETHERIS_EVENT_MAX ?? 50_000);
const DIR = () => process.env.AETHERIS_DATA_DIR ?? path.join(process.cwd(), "data");
const DB_FILE = () => process.env.AETHERIS_EVENTS_DB ?? path.join(DIR(), "telemetry.sqlite");

interface Db { exec(sql: string): void; prepare(sql: string): { run(...a: unknown[]): void; all(...a: unknown[]): Record<string, unknown>[]; get(...a: unknown[]): Record<string, unknown> | undefined } }
const g = globalThis as unknown as {
  __aetherisEvents?: AetherisEvent[];
  __aetherisCounters?: Record<string, { n: number; ok: number; ms: number }>;
  /** Keyed by the resolved database file: the path is configuration, so it can change between calls. */
  __aetherisEventDbs?: Map<string, Db | null>;
};
const buf = (g.__aetherisEvents ??= []);
const counters = (g.__aetherisCounters ??= {});
const dbs = (g.__aetherisEventDbs ??= new Map<string, Db | null>());

/**
 * Open the durable log, once per resolved path. A missing entry = not tried yet; `null` = unavailable
 * (in-memory only) for that path.
 */
function db(): Db | null {
  if (isPgEvents()) return null; // the durable log is Postgres; never open sqlite in this mode
  const file = DB_FILE();
  const cached = dbs.get(file);
  if (cached !== undefined) return cached;
  let opened: Db | null = null;
  try {
    if (process.env.AETHERIS_EVENT_PERSIST === "0") throw new Error("persistence disabled");
    mkdirSync(path.dirname(file), { recursive: true });
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy: node:sqlite must not load on runtimes without it (falls back to in-memory)
    const { DatabaseSync } = require("node:sqlite") as { DatabaseSync: new (p: string) => Db };
    opened = new DatabaseSync(file);
    opened.exec("CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, at INTEGER NOT NULL, type TEXT NOT NULL, uid TEXT, capability TEXT, ok INTEGER NOT NULL, ms INTEGER, detail TEXT, meta TEXT)");
    opened.exec("CREATE INDEX IF NOT EXISTS events_at ON events(at)");
    opened.exec("CREATE INDEX IF NOT EXISTS events_type ON events(type)");
  } catch {
    opened = null;
  }
  dbs.set(file, opened);
  if (opened && buf.length === 0) loadPersisted();
  return opened;
}

/** Pull the newest persisted events back into the ring buffer (called on boot / first read). */
export function loadPersisted(limit = MAX()): number {
  const d = db();
  if (!d) return 0;
  try {
    const rows = d.prepare("SELECT id, at, type, uid, capability, ok, ms, detail, meta FROM events ORDER BY at DESC LIMIT ?").all(limit);
    const restored: AetherisEvent[] = rows.reverse().map((r) => ({
      id: String(r.id), at: Number(r.at), type: r.type as EventType, uid: r.uid == null ? undefined : String(r.uid),
      capability: r.capability == null ? undefined : String(r.capability), ok: !!r.ok,
      ms: r.ms == null ? undefined : Number(r.ms), detail: r.detail == null ? undefined : String(r.detail),
      meta: r.meta ? (JSON.parse(String(r.meta)) as Record<string, unknown>) : undefined,
    }));
    // Counters are rebuilt from what is in memory, so a restored tail is counted like a live one.
    for (const e of restored) {
      if (buf.some((b) => b.id === e.id)) continue;
      buf.push(e);
      const k = `${e.type}:${e.capability ?? "*"}`; const c = (counters[k] ??= { n: 0, ok: 0, ms: 0 }); c.n++; if (e.ok) c.ok++; c.ms += e.ms ?? 0;
    }
    return restored.length;
  } catch { return 0; }
}

/** Where the durable log lives and how much it holds — reported, never assumed. */
export function eventStoreStatus() {
  const d = db();
  let rows = 0;
  if (d) { try { rows = Number(d.prepare("SELECT COUNT(*) AS n FROM events").get()?.n ?? 0); } catch { rows = 0; } }
  return {
    persistent: !!d,
    driver: d ? "node:sqlite" : "in-memory only",
    file: d ? DB_FILE() : undefined,
    rows,
    cap: PERSIST_MAX(),
    bufferSize: buf.length,
    bufferCap: MAX(),
    reason: d ? undefined : isPgEvents() ? "postgres-backed (this sync snapshot only sees the buffer; use eventStoreStatusAsync)" : process.env.AETHERIS_EVENT_PERSIST === "0" ? "AETHERIS_EVENT_PERSIST=0" : "could not open the telemetry database",
  };
}

/** Never let a key/token land in the event buffer (mirrors security/guard.redactSecrets; kept local to avoid a cycle). */
const scrub = (t: string) => t.replace(/\b(sk|gsk|xai|hf|ghp|gho|github_pat|nvapi|AIza|pk|rk)[-_][A-Za-z0-9_\-]{12,}/g, (m) => m.slice(0, 6) + "…" + m.slice(-3)).replace(/\b(Bearer\s+)[A-Za-z0-9._\-]{16,}/gi, "$1•••");
export function record(e: Omit<AetherisEvent, "id" | "at">): AetherisEvent {
  const ev: AetherisEvent = { id: Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-3), at: Date.now(), ...e, detail: e.detail ? scrub(e.detail).slice(0, 500) : undefined };
  buf.push(ev); if (buf.length > MAX()) buf.splice(0, buf.length - MAX());
  const k = `${e.type}:${e.capability ?? "*"}`; const c = (counters[k] ??= { n: 0, ok: 0, ms: 0 }); c.n++; if (e.ok) c.ok++; c.ms += e.ms ?? 0;
  if (isPgEvents()) {
    // Fire-and-forget: telemetry must never slow down or break the request that emitted it.
    try {
      const p = insertEventPg(ev).catch(() => undefined);
      pendingPg.add(p); p.finally(() => pendingPg.delete(p));
    } catch { /* ignore — the buffer and counters above already captured the event */ }
    return ev;
  }
  const d = db();
  if (d) {
    try {
      d.prepare("INSERT OR REPLACE INTO events (id, at, type, uid, capability, ok, ms, detail, meta) VALUES (?,?,?,?,?,?,?,?,?)")
        .run(ev.id, ev.at, ev.type, ev.uid ?? null, ev.capability ?? null, ev.ok ? 1 : 0, ev.ms ?? null, ev.detail ?? null, ev.meta ? JSON.stringify(ev.meta) : null);
      if (Math.random() < 0.02) d.exec(`DELETE FROM events WHERE id IN (SELECT id FROM events ORDER BY at ASC LIMIT MAX(0, (SELECT COUNT(*) FROM events) - ${PERSIST_MAX()}))`);
    } catch { /* a full disk or a locked file must not break the call that emitted the event */ }
  }
  return ev;
}
/** Time an async operation and record it. */
export async function traced<T>(e: Omit<AetherisEvent, "id" | "at" | "ok" | "ms">, fn: () => Promise<T>): Promise<T> {
  const t0 = Date.now();
  try { const r = await fn(); record({ ...e, ok: true, ms: Date.now() - t0 }); return r; }
  catch (err) { record({ ...e, ok: false, ms: Date.now() - t0, detail: (err as Error).message }); throw err; }
}
export function query(opts: { type?: EventType; uid?: string; capability?: string; since?: number; limit?: number; okOnly?: boolean } = {}): AetherisEvent[] {
  db(); // restores persisted history on a fresh process
  let out = buf;
  if (opts.type) out = out.filter((e) => e.type === opts.type);
  if (opts.uid) out = out.filter((e) => e.uid === opts.uid || e.uid === undefined);
  if (opts.capability) out = out.filter((e) => e.capability === opts.capability);
  if (opts.since) out = out.filter((e) => e.at >= opts.since!);
  if (opts.okOnly === false) out = out.filter((e) => !e.ok);
  return out.slice(-(opts.limit ?? 100)).reverse();
}
export function summary(windowMs = 60 * 60_000) {
  const persist = eventStoreStatus();
  const since = Date.now() - windowMs; const recent = buf.filter((e) => e.at >= since);
  const byType: Record<string, { n: number; ok: number; avgMs: number }> = {};
  for (const e of recent) { const c = (byType[e.type] ??= { n: 0, ok: 0, avgMs: 0 }); c.n++; if (e.ok) c.ok++; c.avgMs += e.ms ?? 0; }
  for (const c of Object.values(byType)) c.avgMs = c.n ? Math.round(c.avgMs / c.n) : 0;
  const top = Object.entries(counters).sort((a, b) => b[1].n - a[1].n).slice(0, 15).map(([k, v]) => ({ key: k, n: v.n, ok: v.ok, avgMs: v.n ? Math.round(v.ms / v.n) : 0 }));
  return { windowMs, events: recent.length, errors: recent.filter((e) => !e.ok).length, byType, top, bufferSize: buf.length, uptimeSec: Math.round(process.uptime()), persistent: persist.persistent, persistedRows: persist.rows };
}
/** Reset the buffer *and* the durable log — used by tests and by the Control Center's "clear". */
export function clear() {
  if (isPgEvents()) clearEventsPg().catch(() => undefined); // sync clear can't await; clearAsync can
  // Open and truncate the durable log *before* emptying the buffer: db() restores a persisted tail
  // when the buffer is empty, so doing this the other way round would refill what we just cleared.
  const d = db(); if (d) { try { d.exec("DELETE FROM events"); } catch { /* ignore */ } }
  buf.length = 0; for (const k of Object.keys(counters)) delete counters[k];
}

// ---- async mirrors (pg-capable; every route and page reads through these) ------------------------
export type QueryOpts = { type?: EventType; uid?: string; capability?: string; since?: number; limit?: number; okOnly?: boolean };

/** In pg mode: durable rows merged with this instance's buffer (deduped by id), newest first. */
export async function queryAsync(opts: QueryOpts = {}): Promise<AetherisEvent[]> {
  if (!isPgEvents()) return query(opts);
  const limit = opts.limit ?? 100;
  let rows: AetherisEvent[];
  try {
    rows = await queryEventsPg({ ...opts, limit: Math.max(limit, 200) });
  } catch {
    rows = [];
  }
  const seen = new Set(rows.map((e) => e.id));
  for (const e of query(opts)) if (!seen.has(e.id)) { seen.add(e.id); rows.push(e); }
  return rows.sort((a, b) => b.at - a.at).slice(0, limit);
}

/** In pg mode `top` is computed from the window's merged rows (counters are per-instance). */
export async function summaryAsync(windowMs = 60 * 60_000) {
  if (!isPgEvents()) return summary(windowMs);
  const persist = await eventStoreStatusAsync();
  const since = Date.now() - windowMs;
  const recent = await queryAsync({ since, limit: 5000 });
  const byType: Record<string, { n: number; ok: number; avgMs: number }> = {};
  const byCap: Record<string, { n: number; ok: number; ms: number }> = {};
  for (const e of recent) {
    const c = (byType[e.type] ??= { n: 0, ok: 0, avgMs: 0 }); c.n++; if (e.ok) c.ok++; c.avgMs += e.ms ?? 0;
    const k = `${e.type}:${e.capability ?? "*"}`; const t = (byCap[k] ??= { n: 0, ok: 0, ms: 0 }); t.n++; if (e.ok) t.ok++; t.ms += e.ms ?? 0;
  }
  for (const c of Object.values(byType)) c.avgMs = c.n ? Math.round(c.avgMs / c.n) : 0;
  const top = Object.entries(byCap).sort((a, b) => b[1].n - a[1].n).slice(0, 15).map(([k, v]) => ({ key: k, n: v.n, ok: v.ok, avgMs: v.n ? Math.round(v.ms / v.n) : 0 }));
  return { windowMs, events: recent.length, errors: recent.filter((e) => !e.ok).length, byType, top, bufferSize: buf.length, uptimeSec: Math.round(process.uptime()), persistent: persist.persistent, persistedRows: persist.rows };
}

export async function loadPersistedAsync(limit = MAX()): Promise<number> {
  if (!isPgEvents()) return loadPersisted(limit);
  let rows: AetherisEvent[];
  try {
    rows = await queryEventsPg({ limit });
  } catch {
    return 0;
  }
  let n = 0;
  for (const e of rows.reverse()) {
    if (buf.some((b) => b.id === e.id)) continue;
    buf.push(e); n++;
    const k = `${e.type}:${e.capability ?? "*"}`; const c = (counters[k] ??= { n: 0, ok: 0, ms: 0 }); c.n++; if (e.ok) c.ok++; c.ms += e.ms ?? 0;
  }
  return n;
}

export async function eventStoreStatusAsync() {
  if (!isPgEvents()) return eventStoreStatus();
  try {
    return {
      persistent: true, driver: "postgres", rows: await countEventsPg(), cap: PERSIST_MAX(),
      bufferSize: buf.length, bufferCap: MAX(), reason: undefined as string | undefined,
    };
  } catch (e) {
    return {
      persistent: false, driver: "postgres (unreachable)", rows: 0, cap: PERSIST_MAX(),
      bufferSize: buf.length, bufferCap: MAX(), reason: (e as Error).message as string | undefined,
    };
  }
}

/** Reset the buffer, the counters *and* the durable log, awaiting the pg truncate in pg mode. */
export async function clearAsync(): Promise<void> {
  if (isPgEvents()) await clearEventsPg().catch(() => undefined);
  clear();
}
