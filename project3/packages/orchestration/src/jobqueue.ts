// §46 — Job Queue. Long-running tasks use a durable queue with priority,
// retries, timeout, cancellation and concurrency. Stored in-memory here; the
// shape is durable-queue-friendly (serializable jobs + status).

export type JobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface Job {
  id: string;
  name: string;
  payload: unknown;
  priority: number; // higher = sooner
  maxRetries: number;
  timeoutMs: number;
  status: JobStatus;
  progress: number; // 0..1
  attempts: number;
  result?: unknown;
  error?: string;
}

export type JobWorker = (job: Job, update: (progress: number) => void) => Promise<unknown>;

export interface QueueOptions {
  concurrency?: number;
}

export class JobQueue {
  private jobs = new Map<string, Job>();
  private seq = 0;

  enqueue(name: string, payload: unknown, opts: Partial<Pick<Job, 'priority' | 'maxRetries' | 'timeoutMs'>> = {}): Job {
    const job: Job = {
      id: `job_${++this.seq}`,
      name,
      payload,
      priority: opts.priority ?? 0,
      maxRetries: opts.maxRetries ?? 2,
      timeoutMs: opts.timeoutMs ?? 30000,
      status: 'queued',
      progress: 0,
      attempts: 0,
    };
    this.jobs.set(job.id, job);
    return job;
  }

  get(id: string): Job | undefined {
    return this.jobs.get(id);
  }

  list(): Job[] {
    return [...this.jobs.values()];
  }

  cancel(id: string): boolean {
    const j = this.jobs.get(id);
    if (!j) return false;
    if (j.status === 'running' || j.status === 'queued') {
      j.status = 'cancelled';
      return true;
    }
    return false;
  }

  private withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('job timed out')), ms);
      p.then(
        (v) => {
          clearTimeout(t);
          resolve(v);
        },
        (e) => {
          clearTimeout(t);
          reject(e);
        },
      );
    });
  }

  /** Run the queue with bounded concurrency, retries and timeouts. */
  async run(worker: JobWorker, opts: QueueOptions = {}): Promise<Job[]> {
    const concurrency = Math.max(1, opts.concurrency ?? 2);
    const pending = this.list()
      .filter((j) => j.status === 'queued')
      .sort((a, b) => b.priority - a.priority);

    const runners: Promise<void>[] = [];
    let idx = 0;
    const next = (): Promise<void> => {
      if (idx >= pending.length) return Promise.resolve();
      const job = pending[idx++];
      return this.process(job, worker).then(next);
    };

    for (let i = 0; i < Math.min(concurrency, pending.length); i++) runners.push(next());
    await Promise.all(runners);
    return this.list();
  }

  private async process(job: Job, worker: JobWorker): Promise<void> {
    job.status = 'running';
    while (job.attempts <= job.maxRetries) {
      job.attempts += 1;
      try {
        const r = await this.withTimeout(
          worker(job, (p) => {
            job.progress = Math.max(0, Math.min(1, p));
          }),
          job.timeoutMs,
        );
        job.result = r;
        job.progress = 1;
        job.status = 'completed';
        return;
      } catch (e) {
        job.error = (e as Error).message;
        if (job.attempts > job.maxRetries) {
          job.status = 'failed';
          return;
        }
        // brief backoff before retry
        await new Promise((r) => setTimeout(r, 1));
      }
    }
  }
}
