/**
 * Tiny, dependency-free cron (5 fields: minute hour day-of-month month day-of-week) with time-zone
 * support via Intl. Supports `*`, lists `1,2`, ranges `1-5`, steps ("star slash 15", "1-30/5"), names for
 * months/weekdays. Pure functions; tested in tests/schedules.test.ts.
 */
export interface CronSpec { min: Set<number>; hour: Set<number>; dom: Set<number>; mon: Set<number>; dow: Set<number>; domStar: boolean; dowStar: boolean }

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

function parseField(field: string, min: number, max: number, names?: string[]): Set<number> {
  const out = new Set<number>();
  for (const part of field.split(",")) {
    const [rangeRaw, stepRaw] = part.split("/");
    const step = stepRaw ? Number(stepRaw) : 1;
    if (!Number.isInteger(step) || step < 1) throw new Error(`bad step in "${part}"`);
    let lo = min, hi = max;
    const norm = (s: string) => { const i = names ? names.indexOf(s.toLowerCase().slice(0, 3)) : -1; return i >= 0 ? i + (names === MONTHS ? 1 : 0) : Number(s); };
    if (rangeRaw !== "*") {
      const [a, b] = rangeRaw.split("-");
      lo = norm(a); hi = b !== undefined ? norm(b) : stepRaw ? max : lo;
      if (!Number.isInteger(lo) || !Number.isInteger(hi) || lo < min || hi > max || lo > hi) throw new Error(`bad range "${part}" (${min}-${max})`);
    }
    for (let v = lo; v <= hi; v += step) out.add(v === 7 && max === 7 ? 0 : v);
  }
  return out;
}

export function parseCron(expr: string): CronSpec {
  const f = expr.trim().split(/\s+/);
  if (f.length !== 5) throw new Error("cron needs 5 fields: minute hour day month weekday");
  return { min: parseField(f[0], 0, 59), hour: parseField(f[1], 0, 23), dom: parseField(f[2], 1, 31), mon: parseField(f[3], 1, 12, MONTHS), dow: parseField(f[4], 0, 7, DAYS), domStar: f[2] === "*", dowStar: f[4] === "*" };
}

/** Wall-clock parts of `date` in `tz`. */
export function partsIn(date: Date, tz: string): { min: number; hour: number; dom: number; mon: number; dow: number; year: number } {
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour12: false, year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", weekday: "short" });
  const p: Record<string, string> = {}; for (const x of fmt.formatToParts(date)) p[x.type] = x.value;
  return { min: Number(p.minute), hour: Number(p.hour) % 24, dom: Number(p.day), mon: Number(p.month), dow: DAYS.indexOf(p.weekday.toLowerCase()), year: Number(p.year) };
}

export function matches(spec: CronSpec, date: Date, tz: string): boolean {
  const p = partsIn(date, tz);
  if (!spec.min.has(p.min) || !spec.hour.has(p.hour) || !spec.mon.has(p.mon)) return false;
  // Standard cron: if both dom and dow are restricted, either may match.
  const domOk = spec.dom.has(p.dom), dowOk = spec.dow.has(p.dow);
  if (spec.domStar && spec.dowStar) return true;
  if (spec.domStar) return dowOk; if (spec.dowStar) return domOk;
  return domOk || dowOk;
}

/** Next matching minute strictly after `from` (scans up to ~2 years). */
export function nextRun(expr: string | CronSpec, from: Date, tz: string): Date | null {
  const spec = typeof expr === "string" ? parseCron(expr) : expr;
  const t = new Date(from); t.setSeconds(0, 0); t.setMinutes(t.getMinutes() + 1);
  for (let i = 0; i < 366 * 2 * 24 * 60; i++) {
    if (matches(spec, t, tz)) return t;
    // skip faster when the hour can't match
    const p = partsIn(t, tz);
    if (!spec.hour.has(p.hour)) t.setMinutes(t.getMinutes() + (60 - p.min)); else t.setMinutes(t.getMinutes() + 1);
  }
  return null;
}

export function isValidTimeZone(tz: string): boolean { try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return true; } catch { return false; } }

/** Human description for the common presets. */
export function describeCron(expr: string): string {
  const f = expr.trim().split(/\s+/); if (f.length !== 5) return expr;
  const [m, h, dom, mon, dow] = f; const hm = /^\d+$/.test(m) && /^\d+$/.test(h) ? `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}` : null;
  if (m.startsWith("*/") && h === "*" && dom === "*" && mon === "*" && dow === "*") return `every ${m.slice(2)} minutes`;
  if (m !== "*" && h === "*" && dom === "*" && dow === "*") return `hourly at :${m.padStart(2, "0")}`;
  if (hm && dom === "*" && mon === "*" && dow === "*") return `daily at ${hm}`;
  if (hm && dom === "*" && mon === "*" && dow === "1-5") return `weekdays at ${hm}`;
  if (hm && dom === "*" && mon === "*" && /^[0-7a-z]+$/i.test(dow)) return `every ${DAYS[Number.isNaN(Number(dow)) ? DAYS.indexOf(dow.toLowerCase().slice(0, 3)) : Number(dow) % 7]?.replace(/^./, (c) => c.toUpperCase()) ?? dow} at ${hm}`;
  if (hm && dom !== "*" && mon === "*" && dow === "*") return `monthly on day ${dom} at ${hm}`;
  return expr;
}
