/**
 * Maintenance Calendar.
 *
 *   A read-side view of every maintenance entry across the
 *   user's fleet, with a forward-looking 90-day projection
 *   of next-due dates. The data comes from the production
 *   twin maintenance array (which the user enters via the
 *   Twin Edit API or which is created on twin construction).
 *
 *   The page renders two views:
 *     - a calendar: every entry bucketed by day, ordered;
 *     - a forward-90-day projection: each entry placed at
 *       its next-due date, grouped by week.
 *
 *   Nothing is fabricated; the engine only reads what the
 *   user has actually declared.
 */

import { listTwins, type Twin } from "@/aetheris/core/twins/twins";

export interface MaintenanceEntry {
  twinId: string;
  twinName: string;
  note: string;
  at: number;
  nextDue: number | null;
  daysUntilDue: number | null;
  overdue: boolean;
  bucket: "overdue" | "today" | "this_week" | "this_month" | "later" | "no_due_date";
}

export interface MaintenanceCalendar {
  uid: string;
  total: number;
  overdue: number;
  thisWeek: number;
  thisMonth: number;
  later: number;
  noDueDate: number;
  /** All entries sorted by nextDue asc (overdue first, no-due-date last). */
  entries: MaintenanceEntry[];
  /** Projected by day, 90 days forward, oldest-first. */
  projection: { day: string; entries: MaintenanceEntry[] }[];
  generatedAt: number;
}

function bucketFor(daysUntilDue: number | null): MaintenanceEntry["bucket"] {
  if (daysUntilDue === null) return "no_due_date";
  if (daysUntilDue < 0) return "overdue";
  if (daysUntilDue === 0) return "today";
  if (daysUntilDue <= 7) return "this_week";
  if (daysUntilDue <= 30) return "this_month";
  return "later";
}

function dayKey(t: number): string {
  return new Date(t).toISOString().slice(0, 10);
}

function makeEntry(twin: Twin, m: Twin["maintenance"][number]): MaintenanceEntry {
  const daysUntilDue = m.nextDue ? Math.round((m.nextDue - Date.now()) / 86_400_000) : null;
  return {
    twinId: twin.id,
    twinName: twin.name,
    note: m.note,
    at: m.at,
    nextDue: m.nextDue ?? null,
    daysUntilDue,
    overdue: daysUntilDue !== null && daysUntilDue < 0,
    bucket: bucketFor(daysUntilDue),
  };
}

export async function maintenanceCalendar(uid: string): Promise<MaintenanceCalendar> {
  const twins = await listTwins(uid);
  const entries: MaintenanceEntry[] = [];
  for (const t of twins) {
    for (const m of t.maintenance) {
      entries.push(makeEntry(t, m));
    }
  }
  entries.sort((a, b) => {
    // Overdue first, then by daysUntilDue asc, then no-due-date at the end.
    if (a.daysUntilDue === null && b.daysUntilDue === null) return 0;
    if (a.daysUntilDue === null) return 1;
    if (b.daysUntilDue === null) return -1;
    return a.daysUntilDue - b.daysUntilDue;
  });
  // Build the 90-day projection: bucket entries by day (today + 90 days forward).
  const projection = new Map<string, MaintenanceEntry[]>();
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const startMs = today.getTime();
  for (let i = 0; i < 90; i++) {
    const d = new Date(startMs + i * 86_400_000);
    const k = d.toISOString().slice(0, 10);
    projection.set(k, []);
  }
  for (const e of entries) {
    if (e.nextDue === null) continue;
    const k = dayKey(e.nextDue);
    if (projection.has(k)) projection.get(k)!.push(e);
  }
  const projectionArr = [...projection.entries()].map(([day, list]) => ({ day, entries: list }));
  // Rollup
  let overdue = 0, thisWeek = 0, thisMonth = 0, later = 0, noDueDate = 0;
  for (const e of entries) {
    if (e.bucket === "overdue") overdue++;
    else if (e.bucket === "this_week" || e.bucket === "today") thisWeek++;
    else if (e.bucket === "this_month") thisMonth++;
    else if (e.bucket === "later") later++;
    else noDueDate++;
  }
  return {
    uid,
    total: entries.length,
    overdue,
    thisWeek,
    thisMonth,
    later,
    noDueDate,
    entries,
    projection: projectionArr,
    generatedAt: Date.now(),
  };
}
