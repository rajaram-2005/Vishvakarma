// §64 / §65 / §66 — Cost Engine, Usage Limits and Quota Management.
//
// Tracks model/plugin/generation/storage/bandwidth/compute spend, exposes
// pre-operation estimates, and enforces per-user/project/model/plugin/api-key/
// org usage limits with remaining/reset/estimated-usage reporting.

export type CostKind = 'model' | 'plugin' | 'generation' | 'storage' | 'bandwidth' | 'compute';

export interface CostEntry {
  scope: string; // e.g. user:alice, project:p1, model:gpt, apikey:k
  kind: CostKind;
  amount: number; // USD
  at: string; // ISO
}

export class CostEngine {
  private entries: CostEntry[] = [];

  record(entry: Omit<CostEntry, 'at'> & { at?: string }): CostEntry {
    const full: CostEntry = { ...entry, at: entry.at ?? new Date().toISOString() };
    this.entries.push(full);
    return full;
  }

  total(): number {
    return this.entries.reduce((a, e) => a + e.amount, 0);
  }

  byScope(scope: string): number {
    return this.entries.filter((e) => e.scope === scope).reduce((a, e) => a + e.amount, 0);
  }

  byKind(kind: CostKind): number {
    return this.entries.filter((e) => e.kind === kind).reduce((a, e) => a + e.amount, 0);
  }

  /** Estimate a model call before spending. */
  estimateModel(usdPer1kInput: number, usdPer1kOutput: number, inputTokens: number, outputTokens: number): number {
    return (inputTokens / 1000) * usdPer1kInput + (outputTokens / 1000) * usdPer1kOutput;
  }

  reset(): void {
    this.entries = [];
  }
}

export type LimitKey = 'user' | 'project' | 'model' | 'plugin' | 'apikey' | 'org';

export interface Limit {
  key: LimitKey;
  id: string;
  max: number;
}

export interface QuotaReport {
  allowed: boolean;
  used: number;
  remaining: number;
  resetDate: string;
  estimatedUsage: number;
}

/** §65 / §66 — usage limits and quota reporting. */
export class UsageLimits {
  private limits = new Map<string, number>();
  private used = new Map<string, number>();

  set(key: string, max: number): void {
    this.limits.set(key, max);
  }

  private composite(key: LimitKey, id: string): string {
    return `${key}:${id}`;
  }

  check(key: LimitKey, id: string, amount = 0): QuotaReport {
    const k = this.composite(key, id);
    const max = this.limits.get(k) ?? Infinity;
    const already = this.used.get(k) ?? 0;
    const remaining = max === Infinity ? Infinity : Math.max(0, max - already);
    return {
      allowed: already + amount <= max,
      used: already,
      remaining,
      resetDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
      estimatedUsage: already + amount,
    };
  }

  consume(key: LimitKey, id: string, amount: number): QuotaReport {
    const k = this.composite(key, id);
    const before = this.used.get(k) ?? 0;
    this.used.set(k, before + amount);
    return this.check(key, id, 0);
  }
}
