// Lumen Studio — natural-language schedule parsing.
// “every morning at 8 am summarize AI news” → cron + task. Deterministic,
// offline, with an explicit human-readable interpretation for confirmation.

export interface ParsedSchedule {
  cron: string;
  human: string;
  name: string;
  taskPrompt: string;
  tz: string;
  kind: 'recurring' | 'one-time';
}

const MINUTES: Record<string, number> = {};
const HOURS: Record<string, number> = {};
for (let h = 1; h <= 12; h++) {
  HOURS[String(h)] = h;
  MINUTES[String(h)] = h;
}
for (let m = 1; m <= 59; m++) MINUTES[String(m)] = m;

const DOW: Record<string, number> = {
  sunday: 0, sun: 0, monday: 1, mon: 1, tuesday: 2, tue: 2, wednesday: 3, wed: 3,
  thursday: 4, thu: 4, thurs: 4, friday: 5, fri: 5, saturday: 6, sat: 6,
};

export function parseSchedule(text: string, tz: string): ParsedSchedule | null {
  const t = text.toLowerCase().replace(/[?.!]/g, '');
  const every = /every\s+(.+?)\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/.exec(t);
  const daily = /daily\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/.exec(t);
  const atTime = /(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)/.exec(t);
  const tomorrow = /\btomorrow\b/.test(t);
  const today = /\btoday\b/.test(t);

  const to24 = (h: number, ampm?: string) => {
    if (!ampm) return h;
    if (ampm === 'pm' && h < 12) return h + 12;
    if (ampm === 'am' && h === 12) return 0;
    return h;
  };

  const task = (clean: string) => {
    const cut = clean
      .replace(/^(every\s+.+?\d{1,2}(:\d{2})?\s*(am|pm)?\s+)/, '')
      .replace(/^(daily\s+(at\s+)?\d{1,2}(:\d{2})?\s*(am|pm)?\s+)/, '')
      .replace(/^(remind me (to )?)/, 'Reminder: ')
      .replace(/^(summarize|create|prepare|scan|generate|send|check|research)\s+/, (m) => m.charAt(0).toUpperCase() + m.slice(1));
    return cut.trim() || 'Run the scheduled task';
  };

  const mk = (cron: string, human: string, kind: 'recurring' | 'one-time', nameBase: string): ParsedSchedule => ({
    cron, human, kind, tz,
    name: `${nameBase} — ${task(t).slice(0, 40)}`,
    taskPrompt: task(t),
  });

  if (every) {
    const when = every[1];
    const h = to24(Number(every[2]), every[4]);
    const m = Number(every[3] ?? 0);
    if (h > 23 || m > 59) return null;
    const dayMatch = Object.entries(DOW).find(([d]) => when.includes(d));
    if (dayMatch) return mk(`${m} ${h} * * ${dayMatch[1]}`, `every ${dayMatch[0]} at ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`, 'recurring', 'Weekly task');
    if (/morning/.test(when)) return mk(`${m} 8 * * *`, `daily at 08:${String(m).padStart(2, '0')}`, 'recurring', 'Morning task');
    if (/evening|night/.test(when)) return mk(`${m} 19 * * *`, `daily at 19:${String(m).padStart(2, '0')}`, 'recurring', 'Evening task');
    if (/afternoon/.test(when)) return mk(`${m} 14 * * *`, `daily at 14:${String(m).padStart(2, '0')}`, 'recurring', 'Afternoon task');
    if (/hour/.test(when)) return mk(`${m} * * * *`, `hourly at :${String(m).padStart(2, '0')}`, 'recurring', 'Hourly task');
    if (/day/.test(when) || /daily/.test(when)) return mk(`${m} ${h} * * *`, `daily at ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`, 'recurring', 'Daily task');
    if (/week/.test(when) || /monday/.test(when)) return mk(`${m} ${h} * * 1`, `every monday at ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`, 'recurring', 'Weekly task');
    if (/month/.test(when)) return mk(`${m} ${h} 1 * *`, `1st of the month at ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`, 'recurring', 'Monthly task');
    return null;
  }
  if (daily) {
    const h = to24(Number(daily[1]), daily[3]);
    const m = Number(daily[2] ?? 0);
    if (h > 23 || m > 59) return null;
    return mk(`${m} ${h} * * *`, `daily at ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`, 'recurring', 'Daily task');
  }
  if (atTime && (tomorrow || today)) {
    const h = to24(Number(atTime[1]), atTime[3]);
    const m = Number(atTime[2] ?? 0);
    if (h > 23 || m > 59) return null;
    const d = new Date();
    if (tomorrow) d.setDate(d.getDate() + 1);
    return mk(`${m} ${h} ${d.getDate()} ${d.getMonth() + 1} *`, `once, ${today ? 'today' : 'tomorrow'} at ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`, 'one-time', 'One-time task');
  }
  return null;
}

export const SCHEDULE_NL_EXAMPLES = [
  'every morning at 8 am summarize AI news',
  'every monday at 9:00 prepare my business report',
  'every day at 18:30 scan my repository for security issues',
  'tomorrow at 6 pm remind me to study',
];
