// §9 / §10 / §11 — Model Router, Fallback & Provider Health.
//
// Smart routing modes (AUTO / QUALITY / FAST / CHEAP / PRIVATE / LOCAL /
// BALANCED / CUSTOM) with explicit priority ordering, a privacy-aware
// fallback chain, and continuous provider health tracking.

import { rankModels, analyzeRequest } from '@sutra/model-adapters';
import type { ModelInfo } from '@sutra/shared';
import type { HealthStatus, RoutingContext, RoutingMode } from './types';

export const HEALTH_LABELS: Record<HealthStatus, string> = {
  healthy: 'Healthy',
  degraded: 'Degraded',
  unavailable: 'Unavailable',
  'rate-limited': 'Rate Limited',
  'auth-required': 'Requires Authentication',
};

const LAT_RANK: Record<ModelInfo['latencyTier'], number> = { low: 0, medium: 1, high: 2 };

function filterByPrivacy(models: ModelInfo[], privacyMode?: 'local' | 'cloud' | 'hybrid'): ModelInfo[] {
  if (privacyMode === 'local') return models.filter((m) => m.local);
  return models;
}

function filterByOffline(models: ModelInfo[], offline: boolean): ModelInfo[] {
  if (!offline) return models;
  return models.filter((m) => m.local);
}

function capabilityOverlap(a: ModelInfo, b: ModelInfo): number {
  return a.capabilities.filter((c) => b.capabilities.includes(c)).length;
}

function dimScore(m: ModelInfo, dim: NonNullable<RoutingContext['priorities']>[number]): number {
  switch (dim) {
    case 'capability':
    case 'quality':
      return m.capabilities.length;
    case 'cost':
      return -(m.costIn + m.costOut); // lower cost => higher score
    case 'latency':
      return { low: 2, medium: 1, high: 0 }[m.latencyTier];
    case 'privacy':
      return m.local ? 1 : 0;
    case 'availability':
      return m.available ? 1 : 0;
  }
}

function rankByPriorities(
  pool: ModelInfo[],
  priorities: NonNullable<RoutingContext['priorities']>,
): ModelInfo[] {
  return [...pool].sort((a, b) => {
    for (const p of priorities) {
      const d = dimScore(b, p) - dimScore(a, p);
      if (d !== 0) return d;
    }
    return 0;
  });
}

/** Choose a model for a request under a routing mode. Never returns a model
 *  that violates the privacy/offline context. */
export function selectModel(
  models: ModelInfo[],
  mode: RoutingMode,
  ctx: RoutingContext = {},
): ModelInfo | null {
  let pool = models.filter((m) => m.available);
  pool = filterByOffline(pool, !!ctx.offline);
  pool = filterByPrivacy(pool, ctx.privacyMode);
  if (!pool.length) return null;

  switch (mode) {
    case 'private':
    case 'local': {
      const local = pool.filter((m) => m.local);
      const use = local.length ? local : pool;
      return rankByPriorities(use, ['capability', 'latency', 'cost'])[0] ?? null;
    }
    case 'cheap':
      return [...pool].sort((a, b) => a.costIn + a.costOut - (b.costIn + b.costOut))[0] ?? null;
    case 'fast':
      return [...pool].sort((a, b) => LAT_RANK[a.latencyTier] - LAT_RANK[b.latencyTier])[0] ?? null;
    case 'quality':
      return [...pool].sort((a, b) => b.capabilities.length - a.capabilities.length)[0] ?? null;
    case 'balanced':
      return rankByPriorities(pool, ['capability', 'latency', 'cost'])[0] ?? null;
    case 'custom':
      return rankByPriorities(pool, ctx.priorities ?? ['capability', 'cost', 'latency'])[0] ?? null;
    case 'auto':
    default: {
      const analysis = analyzeRequest(ctx.text ?? '', !!ctx.offline);
      const ranking = rankModels(pool, analysis);
      const top = ranking[0]?.modelId;
      return pool.find((m) => m.id === top) ?? pool[0] ?? null;
    }
  }
}

/**
 * §9 — Build a fallback chain after `primaryId` fails. Candidates preserve
 * the primary's capability class where possible and NEVER violate privacy or
 * offline constraints.
 */
export function fallbackChain(
  models: ModelInfo[],
  primaryId: string,
  opts: { offline?: boolean; privacyMode?: 'local' | 'cloud' | 'hybrid' } = {},
): ModelInfo[] {
  const primary = models.find((m) => m.id === primaryId);
  let pool = models.filter((m) => m.id !== primaryId && m.available);
  pool = filterByOffline(pool, !!opts.offline);
  pool = filterByPrivacy(pool, opts.privacyMode);
  if (primary) {
    pool = [...pool].sort(
      (a, b) =>
        capabilityOverlap(b, primary) - capabilityOverlap(a, primary) ||
        b.capabilities.length - a.capabilities.length,
    );
  }
  return pool;
}

interface HealthRecord {
  status: HealthStatus;
  latencyMs: number;
  successes: number;
  errors: number;
  rateLimited: number;
  authErrors: number;
  consecutiveFailures: number;
  lastCheck: number;
}

export class HealthRegistry {
  private map = new Map<string, HealthRecord>();

  private ensure(id: string): HealthRecord {
    let r = this.map.get(id);
    if (!r) {
      r = {
        status: 'healthy',
        latencyMs: 0,
        successes: 0,
        errors: 0,
        rateLimited: 0,
        authErrors: 0,
        consecutiveFailures: 0,
        lastCheck: Date.now(),
      };
      this.map.set(id, r);
    }
    return r;
  }

  recordSuccess(id: string, latencyMs: number): HealthStatus {
    const r = this.ensure(id);
    r.successes += 1;
    r.latencyMs = latencyMs;
    r.consecutiveFailures = 0;
    r.rateLimited = 0; // recovered
    r.authErrors = 0; // recovered
    r.lastCheck = Date.now();
    return this.recompute(r);
  }

  recordError(id: string, kind: 'error' | 'rate-limit' | 'auth' = 'error'): HealthStatus {
    const r = this.ensure(id);
    r.lastCheck = Date.now();
    if (kind === 'rate-limit') r.rateLimited += 1;
    else if (kind === 'auth') r.authErrors += 1;
    else r.errors += 1;
    r.consecutiveFailures += 1;
    return this.recompute(r);
  }

  private recompute(r: HealthRecord): HealthStatus {
    let status: HealthStatus;
    if (r.authErrors > 0) status = 'auth-required';
    else if (r.rateLimited > 0) status = 'rate-limited';
    else if (r.consecutiveFailures >= 3) status = 'unavailable';
    else if (r.consecutiveFailures >= 1 && r.successes + r.errors >= 2) status = 'degraded';
    else status = 'healthy';
    r.status = status;
    return status;
  }

  statusOf(id: string): HealthStatus {
    return this.map.get(id)?.status ?? 'healthy';
  }

  summary(): Record<string, { status: HealthStatus; latencyMs: number; errorRate: number }> {
    const out: Record<string, { status: HealthStatus; latencyMs: number; errorRate: number }> = {};
    for (const [id, r] of this.map) {
      const total = r.successes + r.errors;
      out[id] = {
        status: r.status,
        latencyMs: r.latencyMs,
        errorRate: total > 0 ? r.errors / total : 0,
      };
    }
    return out;
  }
}
