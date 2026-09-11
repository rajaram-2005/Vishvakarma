/**
 * Server-sent events, resume-safe.
 *
 * Every frame carries an incrementing `id:` so clients can reconnect with `Last-Event-ID` and the
 * server can replay exactly what was missed. Generative streams add idempotency on top: the client
 * sends `X-Run-Id` (one uuid per user message) and the route memoizes the completed run briefly —
 * a retry replays the stored events instead of regenerating (no double LLM spend, and routes check
 * the memo BEFORE consuming quota, so no double charge either). Completions only: errors are never
 * memoized, and a memo miss (eviction, TTL, another instance) simply regenerates.
 */

export function sseHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    "X-Accel-Buffering": "no",
    ...extra,
  };
}

/** The last event id the client already has (0 when absent/invalid = send everything). */
export function lastEventId(req: Request): number {
  const n = Number(req.headers.get("last-event-id"));
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

/** Client-supplied idempotency key for a run (strict charset so it is safe as a map key). */
export function runIdOf(req: Request): string | undefined {
  const v = req.headers.get("x-run-id")?.trim();
  return v && /^[A-Za-z0-9_-]{8,64}$/.test(v) ? v : undefined;
}

export const sseFrame = (id: number, json: string) => `id: ${id}\ndata: ${json}\n\n`;

/** Live channel: assigns incrementing ids and keeps the log a retry replays from. */
export class SseChannel {
  private n = 0;
  readonly log: { id: number; json: string }[] = [];
  constructor(private controller: ReadableStreamDefaultController, private enc: TextEncoder = new TextEncoder()) {}
  /** Send one event; returns its id. */
  send(event: unknown): number {
    return this.raw(JSON.stringify(event));
  }
  /** Send a pre-serialized payload (e.g. the OpenAI `[DONE]` sentinel); returns its id. */
  raw(json: string): number {
    this.n++;
    this.log.push({ id: this.n, json });
    this.controller.enqueue(this.enc.encode(sseFrame(this.n, json)));
    return this.n;
  }
  get count(): number {
    return this.n;
  }
}

export interface MemoizedRun {
  at: number;
  events: { id: number; json: string }[];
}

/**
 * Short-lived per-instance memo of completed runs + in-flight claims. Bounded (TTL + cap);
 * a miss regenerates, so cross-instance retries degrade honestly instead of failing.
 */
export class RunMemo {
  private runs = new Map<string, MemoizedRun>();
  private inflight = new Set<string>();
  constructor(private ttlMs = 10 * 60_000, private max = 200) {}
  get(id: string): MemoizedRun | undefined {
    const m = this.runs.get(id);
    if (!m || Date.now() - m.at > this.ttlMs) {
      this.runs.delete(id);
      return undefined;
    }
    return m;
  }
  set(id: string, events: { id: number; json: string }[]): void {
    this.runs.set(id, { at: Date.now(), events });
    while (this.runs.size > this.max) {
      const oldest = this.runs.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.runs.delete(oldest);
    }
  }
  /** Claim a run id for generation; false means it is already generating in this instance. */
  claim(id: string): boolean {
    if (this.inflight.has(id)) return false;
    this.inflight.add(id);
    return true;
  }
  release(id: string): void {
    this.inflight.delete(id);
  }
  /** Tests only. */
  get size(): number {
    return this.runs.size;
  }
}
