/**
 * Audit Export.
 *
 *   A read-side composer that turns the production
 *   observability event log into an exportable audit bundle.
 *   Two formats: JSON (full event objects, machine-readable)
 *   and CSV (one row per event, summary fields, spreadsheet-
 *   friendly).
 *
 *   The export is filtered to the user's uid (and only events
 *   the user is allowed to see). The output is identical
 *   to what the production query() returns — no fabrication,
 *   no transformation, just a different rendering.
 */

import { query, queryAsync, type AetherisEvent, type EventType } from "@/aetheris/core/observability/events";

export interface AuditExportJson {
  format: "json";
  uid: string;
  total: number;
  events: AetherisEvent[];
  exportedAt: number;
}

export interface AuditExportCsv {
  format: "csv";
  uid: string;
  total: number;
  headers: string[];
  rows: string[][];
  exportedAt: number;
}

export type AuditExport = AuditExportJson | AuditExportCsv;

export type AuditExportOpts = { type?: EventType; sinceMs?: number; limit?: number; okOnly?: boolean };

export function exportJson(uid: string, opts: AuditExportOpts = {}): AuditExportJson {
  // We pull a wide window and filter on our end so okOnly has
  // the right semantics (the production query() inverts the
  // okOnly flag, so we can't trust it).
  const window = Math.max(1000, (opts.limit ?? 1000) * 4);
  const events = query({ uid, type: opts.type, since: opts.sinceMs, limit: window });
  return composeJson(uid, events, opts);
}

/** Async twin: identical output, reads the pg log in hosted mode. Routes and pages use this. */
export async function exportJsonAsync(uid: string, opts: AuditExportOpts = {}): Promise<AuditExportJson> {
  const window = Math.max(1000, (opts.limit ?? 1000) * 4);
  const events = await queryAsync({ uid, type: opts.type, since: opts.sinceMs, limit: window });
  return composeJson(uid, events, opts);
}

function composeJson(uid: string, events: AetherisEvent[], opts: AuditExportOpts): AuditExportJson {
  let out = events;
  if (opts.okOnly) out = out.filter((e) => e.ok);
  out = out.slice(0, opts.limit ?? 100);
  return { format: "json", uid, total: out.length, events: out, exportedAt: Date.now() };
}

const CSV_HEADERS = ["id", "at", "type", "uid", "capability", "ok", "ms", "detail"];

function csvCell(s: string): string {
  if (s.includes(",") || s.includes("\"") || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function exportCsv(uid: string, opts: AuditExportOpts = {}): AuditExportCsv {
  const window = Math.max(1000, (opts.limit ?? 1000) * 4);
  const events = query({ uid, type: opts.type, since: opts.sinceMs, limit: window });
  return composeCsv(uid, events, opts);
}

/** Async twin: identical output, reads the pg log in hosted mode. Routes and pages use this. */
export async function exportCsvAsync(uid: string, opts: AuditExportOpts = {}): Promise<AuditExportCsv> {
  const window = Math.max(1000, (opts.limit ?? 1000) * 4);
  const events = await queryAsync({ uid, type: opts.type, since: opts.sinceMs, limit: window });
  return composeCsv(uid, events, opts);
}

function composeCsv(uid: string, events: AetherisEvent[], opts: AuditExportOpts): AuditExportCsv {
  let out = events;
  if (opts.okOnly) out = out.filter((e) => e.ok);
  out = out.slice(0, opts.limit ?? 100);
  const rows = out.map((e) => [
    e.id, String(e.at), e.type, e.uid ?? "", e.capability ?? "", e.ok ? "true" : "false", e.ms === undefined ? "" : String(e.ms), e.detail ?? "",
  ]);
  return { format: "csv", uid, total: out.length, headers: CSV_HEADERS, rows, exportedAt: Date.now() };
}

export function toCsvString(c: AuditExportCsv): string {
  const lines = [c.headers.map(csvCell).join(",")];
  for (const r of c.rows) lines.push(r.map(csvCell).join(","));
  return lines.join("\n") + "\n";
}
