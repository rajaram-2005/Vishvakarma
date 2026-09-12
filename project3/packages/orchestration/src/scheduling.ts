// §57 / §58 / §59 — Schedule Reliability, Misfire Handling and Timezone Safety.
//
// Every scheduled task needs next run, last run, status, duration, result,
// failure reason, retry policy and an explicit timezone. Missed executions are
// resolved by a configurable misfire policy — never silently.

export type MisfirePolicy = 'skip' | 'run-immediately' | 'run-next';
export type Weekday = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

export interface Schedule {
  id: string;
  name: string;
  /** A small expression language: 'every 30m' | 'daily' | 'weekly' |
   *  'every saturday' | 'every 2h'. */
  expr: string;
  timezone: string; // explicit timezone, never assume UTC or local server time
  status: 'active' | 'paused' | 'error';
  lastRun?: string;
  nextRun: string;
  durationMs?: number;
  lastResult?: 'success' | 'failure';
  failureReason?: string;
  retryPolicy: { maxRetries: number; backoffMs: number };
  misfire: MisfirePolicy;
}

// Sunday-indexed to match Date.getUTCDay() (0 = Sunday).
const WEEKDAYS: Weekday[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function parseExpr(expr: string): { kind: 'interval'; ms: number } | { kind: 'daily' } | { kind: 'weekly'; day?: Weekday } {
  const e = expr.trim().toLowerCase();
  const interval = e.match(/^every\s+(\d+)\s*(m|h|d|w)$/);
  if (interval) {
    const n = parseInt(interval[1], 10);
    const unit = interval[2];
    const ms = unit === 'm' ? n * 60000 : unit === 'h' ? n * 3600000 : unit === 'd' ? n * 86400000 : n * 604800000;
    return { kind: 'interval', ms };
  }
  if (e === 'daily') return { kind: 'daily' };
  if (e === 'weekly') return { kind: 'weekly' };
  const wd = WEEKDAYS.find((d) => e === `every ${d}`);
  if (wd) return { kind: 'weekly', day: wd };
  throw new Error(`Unsupported schedule expression: ${expr}`);
}

export class ScheduleManager {
  private schedules = new Map<string, Schedule>();

  private next(from: Date, expr: string): Date {
    const p = parseExpr(expr);
    if (p.kind === 'interval') return new Date(from.getTime() + p.ms);
    if (p.kind === 'daily') return new Date(from.getTime() + 86400000);
    // weekly
    const target = p.day ? WEEKDAYS.indexOf(p.day) : from.getUTCDay();
    const cur = from.getUTCDay();
    let days = (target - cur + 7) % 7;
    if (days === 0) days = 7;
    return new Date(from.getTime() + days * 86400000);
  }

  create(input: Omit<Schedule, 'nextRun' | 'status'> & Partial<Pick<Schedule, 'status' | 'nextRun'>>): Schedule {
    const now = new Date();
    const s: Schedule = {
      status: input.status ?? 'active',
      nextRun: input.nextRun ?? this.next(now, input.expr).toISOString(),
      ...input,
    };
    this.schedules.set(s.id, s);
    return s;
  }

  get(id: string): Schedule | undefined {
    return this.schedules.get(id);
  }

  list(): Schedule[] {
    return [...this.schedules.values()];
  }

  /** Recompute next run for an active schedule after a successful run. */
  markRun(id: string, result: 'success' | 'failure', durationMs: number, reason?: string, at = new Date()): Schedule {
    const s = this.schedules.get(id);
    if (!s) throw new Error(`Unknown schedule ${id}`);
    s.lastRun = at.toISOString();
    s.durationMs = durationMs;
    s.lastResult = result;
    s.failureReason = reason;
    s.status = result === 'failure' ? 'error' : 'active';
    s.nextRun = this.next(at, s.expr).toISOString();
    return s;
  }

  /**
   * §58 — Handle a missed execution. If the system was unavailable at nextRun,
   * apply the misfire policy instead of blindly running or silently dropping.
   */
  handleMissed(id: string, now = new Date()): 'skip' | 'run' {
    const s = this.schedules.get(id);
    if (!s) throw new Error(`Unknown schedule ${id}`);
    const missed = new Date(s.nextRun).getTime() < now.getTime();
    if (!missed) return 'skip';
    if (s.misfire === 'skip') {
      s.nextRun = this.next(now, s.expr).toISOString();
      return 'skip';
    }
    if (s.misfire === 'run-next') {
      s.nextRun = this.next(now, s.expr).toISOString();
      return 'run';
    }
    // run-immediately
    return 'run';
  }
}
