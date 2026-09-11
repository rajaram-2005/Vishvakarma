/**
 * Observability — postgres durable log (hosted/Vercel path, e.g. Neon). Same event shape as the
 * sqlite log in events.ts; selected with:
 *
 *   AETHERIS_EVENTS=postgres  +  POSTGRES_URL=postgres://...
 *
 * `record()` stays synchronous (it is called in hot paths everywhere), so in pg mode the insert is
 * fire-and-forget: the ring buffer and counters update synchronously and the row follows
 * asynchronously. A lost in-flight insert on serverless freeze is acceptable for telemetry; a
 * failed insert never breaks the request that emitted the event. Reads go through the async
 * mirrors in events.ts (`queryAsync`/`summaryAsync`/…), which merge the durable rows with this
 * instance's buffer. Timestamps are DOUBLE PRECISION epoch-ms (see fabric-pg.ts for why).
 */
import { ensureSchema, type PgRow } from "@/aetheris/lib/pg";
import type { AetherisEvent, EventType } from "./events";

const PERSIST_MAX = () => Number(process.env.AETHERIS_EVENT_MAX ?? 50_000);

const SCHEMA: [string, string, string][] = [
  ["ev-events", `CREATE TABLE IF NOT EXISTS telemetry_events(
    id TEXT PRIMARY KEY, at DOUBLE PRECISION NOT NULL, type TEXT NOT NULL,
    uid TEXT, capability TEXT, ok BOOLEAN NOT NULL,
    ms DOUBLE PRECISION, detail TEXT, meta JSONB)`, "telemetry_events"],
  ["ev-events-at", `CREATE INDEX IF NOT EXISTS telemetry_events_at ON telemetry_events(at DESC)`, "telemetry_events"],
  ["ev-events-type", `CREATE INDEX IF NOT EXISTS telemetry_events_type ON telemetry_events(type)`, "telemetry_events"],
];

async function pool() {
  let p;
  for (const [key, sql, probe] of SCHEMA) p = await ensureSchema(key, sql, probe);
  return p!;
}

const rowToEvent = (r: PgRow): AetherisEvent => ({
  id: r.id as string, at: r.at as number, type: r.type as EventType,
  uid: r.uid == null ? undefined : String(r.uid),
  capability: r.capability == null ? undefined : String(r.capability),
  ok: r.ok === true || r.ok === 1 || r.ok === "t" || r.ok === "true",
  ms: r.ms == null ? undefined : Number(r.ms),
  detail: r.detail == null ? undefined : String(r.detail),
  meta: r.meta == null ? undefined : (typeof r.meta === "string" ? JSON.parse(r.meta) : r.meta) as Record<string, unknown>,
});

export async function insertEventPg(ev: AetherisEvent): Promise<void> {
  const p = await pool();
  await p.query(
    `INSERT INTO telemetry_events(id, at, type, uid, capability, ok, ms, detail, meta)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (id) DO UPDATE SET at = EXCLUDED.at, type = EXCLUDED.type, uid = EXCLUDED.uid,
       capability = EXCLUDED.capability, ok = EXCLUDED.ok, ms = EXCLUDED.ms,
       detail = EXCLUDED.detail, meta = EXCLUDED.meta`,
    [ev.id, ev.at, ev.type, ev.uid ?? null, ev.capability ?? null, ev.ok, ev.ms ?? null, ev.detail ?? null,
      ev.meta ? JSON.stringify(ev.meta) : null]
  );
  // Probabilistic retention trim, mirroring the sqlite log's 2% chance per insert.
  if (Math.random() < 0.02) {
    await p.query(
      `DELETE FROM telemetry_events WHERE id IN (
         SELECT id FROM telemetry_events ORDER BY at ASC
         LIMIT GREATEST(0, (SELECT COUNT(*) FROM telemetry_events) - $1))`,
      [PERSIST_MAX()]
    ).catch(() => undefined);
  }
}

export interface PgQueryOpts { type?: EventType; uid?: string; capability?: string; since?: number; limit?: number; okOnly?: boolean }

export async function queryEventsPg(opts: PgQueryOpts = {}): Promise<AetherisEvent[]> {
  const conds: string[] = []; const params: unknown[] = [];
  if (opts.type) { params.push(opts.type); conds.push(`type = $${params.length}`); }
  // Mirror query(): events without a uid are visible to every uid.
  if (opts.uid) { params.push(opts.uid); conds.push(`(uid = $${params.length} OR uid IS NULL)`); }
  if (opts.capability) { params.push(opts.capability); conds.push(`capability = $${params.length}`); }
  if (opts.since) { params.push(opts.since); conds.push(`at >= $${params.length}`); }
  if (opts.okOnly === false) conds.push(`ok = false`);
  params.push(opts.limit ?? 100);
  const rows = (await (await pool()).query(
    `SELECT id, at, type, uid, capability, ok, ms, detail, meta FROM telemetry_events` +
    (conds.length ? ` WHERE ${conds.join(" AND ")}` : ``) +
    ` ORDER BY at DESC LIMIT $${params.length}`, params)).rows;
  return rows.map(rowToEvent);
}

export async function countEventsPg(): Promise<number> {
  const rows = (await (await pool()).query(`SELECT COUNT(*) AS n FROM telemetry_events`)).rows;
  const n = rows[0]?.n as unknown;
  return Number(Array.isArray(n) ? n[0] : n);
}

export async function clearEventsPg(): Promise<void> {
  await (await pool()).query(`DELETE FROM telemetry_events`);
}
