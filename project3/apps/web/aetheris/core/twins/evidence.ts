/**
 * Evidence Ledger.
 *
 *   A read-side composes an append-only evidence view across
 *   the user's fleet. Evidence = every event on every twin
 *   (the production twin.events array, which is appended by
 *   syncTwin, the edit API, and any other twin mutation),
 *   plus every diagnostic history entry.
 *
 *   The ledger is sorted newest-first, supports filtering by
 *   twin, kind, and since, and returns the rollup counts by
 *   kind. Nothing is fabricated.
 */

import { getHistory } from "@/aetheris/core/diagnostics/history";
import { listTwins } from "@/aetheris/core/twins/twins";
import { store } from "@/aetheris/lib/store";

export type EvidenceSource = "twin-event" | "diagnostic" | "system-event";

export interface EvidenceEntry {
  at: number;
  source: EvidenceSource;
  twinId: string | null;
  /** The "kind" of the entry — twin.event.kind, diagnostic severity, or system event type. */
  kind: string;
  detail: string;
  id: string;
}

export interface EvidenceLedger {
  uid: string;
  total: number;
  bySource: Record<EvidenceSource, number>;
  byKind: Record<string, number>;
  entries: EvidenceEntry[];
  generatedAt: number;
}

const SYSTEM_EVENTS = "system-events";

export async function evidenceLedger(uid: string, opts: { limit?: number; sinceMs?: number; twinId?: string; source?: EvidenceSource } = {}): Promise<EvidenceLedger> {
  const limit = opts.limit ?? 200;
  const sinceMs = opts.sinceMs ?? 0;
  const entries: EvidenceEntry[] = [];

  // 1) Twin events
  const twins = await listTwins(uid);
  for (const t of twins) {
    if (opts.twinId && t.id !== opts.twinId) continue;
    for (const e of t.events) {
      if (e.at < sinceMs) continue;
      entries.push({ at: e.at, source: "twin-event", twinId: t.id, kind: e.kind, detail: e.detail, id: `tw:${t.id}:${e.at}:${e.kind}` });
    }
  }

  // 2) Diagnostic history
  for (const t of twins) {
    if (opts.twinId && t.id !== opts.twinId) continue;
    const h = await getHistory(t.id, { limit: 50, sinceMs });
    for (const row of h) {
      entries.push({
        at: row.tMs,
        source: "diagnostic",
        twinId: t.id,
        kind: row.severity,
        detail: row.topFault ? `peak=${row.peakMagnitude.toFixed(2)} top=${row.topFault} dominant=${row.dominantHz?.toFixed(1) ?? "—"} Hz` : `peak=${row.peakMagnitude.toFixed(2)} dominant=${row.dominantHz?.toFixed(1) ?? "—"} Hz`,
        id: `dh:${t.id}:${row.tMs}`,
      });
    }
  }

  // 3) System events (user-scoped) — best-effort.
  const all = await store.all<{ id: string; at: number; kind: string; detail?: string; uid?: string }>(SYSTEM_EVENTS);
  for (const [k, v] of Object.entries(all)) {
    if (v.uid !== uid) continue;
    if (v.at < sinceMs) continue;
    entries.push({ at: v.at, source: "system-event", twinId: null, kind: v.kind, detail: v.detail ?? "", id: k });
  }

  // Filter
  let filtered = entries;
  if (opts.source) filtered = filtered.filter((e) => e.source === opts.source);
  if (opts.twinId) filtered = filtered.filter((e) => e.twinId === opts.twinId);
  filtered.sort((a, b) => b.at - a.at);
  const out = filtered.slice(0, limit);

  // Rollup
  const bySource: Record<EvidenceSource, number> = { "twin-event": 0, "diagnostic": 0, "system-event": 0 };
  const byKind: Record<string, number> = {};
  for (const e of out) {
    bySource[e.source]++;
    byKind[e.kind] = (byKind[e.kind] ?? 0) + 1;
  }

  return { uid, total: filtered.length, bySource, byKind, entries: out, generatedAt: Date.now() };
}
