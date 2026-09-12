import { describe, it, expect } from 'vitest';
import { selectModel, fallbackChain, HealthRegistry, HEALTH_LABELS } from './router';
import type { ModelInfo } from './types';

const m = (over: Partial<ModelInfo> & Pick<ModelInfo, 'id'>): ModelInfo => ({
  name: over.id,
  provider: 'test',
  runtime: 'openai-compat',
  contextWindow: 8000,
  costIn: 1,
  costOut: 1,
  latencyTier: 'medium',
  capabilities: [],
  available: true,
  local: false,
  ...over,
});

const MODELS: ModelInfo[] = [
  m({ id: 'cheap', costIn: 0.1, costOut: 0.1, latencyTier: 'high', capabilities: ['code'] }),
  m({ id: 'fast', costIn: 5, costOut: 5, latencyTier: 'low', capabilities: ['creative'] }),
  m({ id: 'quality', costIn: 2, costOut: 2, latencyTier: 'medium', capabilities: ['code', 'math', 'long-context', 'creative', 'structured', 'vision'] }),
  m({ id: 'local', runtime: 'ollama', costIn: 50, costOut: 50, latencyTier: 'low', capabilities: ['code'], local: true }),
  m({ id: 'cloud', capabilities: ['code'], local: false }),
];

describe('selectModel', () => {
  it('cheap mode picks the lowest-cost model', () => {
    expect(selectModel(MODELS, 'cheap')?.id).toBe('cheap');
  });

  it('fast mode picks the lowest-latency model', () => {
    expect(selectModel(MODELS, 'fast')?.id).toBe('fast');
  });

  it('quality mode picks the most capable model', () => {
    expect(selectModel(MODELS, 'quality')?.id).toBe('quality');
  });

  it('private/local modes only return local models', () => {
    expect(selectModel(MODELS, 'private', { privacyMode: 'local' })?.id).toBe('local');
    expect(selectModel(MODELS, 'local', { privacyMode: 'local' })?.id).toBe('local');
  });

  it('balanced mode favours capability then latency then cost', () => {
    expect(selectModel(MODELS, 'balanced')?.id).toBe('quality');
  });

  it('custom mode honours the priority order', () => {
    expect(selectModel(MODELS, 'custom', { priorities: ['latency', 'cost'] })?.id).toBe('fast');
    expect(selectModel(MODELS, 'custom', { priorities: ['cost', 'latency'] })?.id).toBe('cheap');
  });

  it('offline mode falls back to local models only', () => {
    expect(selectModel(MODELS, 'auto', { offline: true })?.id).toBe('local');
    const noLocal = MODELS.filter((x) => !x.local);
    expect(selectModel(noLocal, 'auto', { offline: true })).toBeNull();
  });
});

describe('fallbackChain (§9)', () => {
  it('excludes the primary and respects privacy', () => {
    const chain = fallbackChain(MODELS, 'cloud', { privacyMode: 'local' });
    expect(chain.map((c) => c.id)).not.toContain('cloud');
    expect(chain.every((c) => c.local)).toBe(true);
  });

  it('orders candidates by capability overlap with the primary', () => {
    const cloud = MODELS.find((x) => x.id === 'cloud')!;
    const chain = fallbackChain(MODELS, 'cloud', {});
    expect(chain[0].id).toBe('quality'); // 1 capability overlap, beats others
    expect(chain).not.toContain(cloud);
  });
});

describe('HealthRegistry (§10)', () => {
  it('is healthy by default and after success', () => {
    const h = new HealthRegistry();
    expect(h.statusOf('x')).toBe('healthy');
    expect(h.recordSuccess('x', 12)).toBe('healthy');
  });

  it('marks unavailable after repeated failures', () => {
    const h = new HealthRegistry();
    expect(h.recordError('x')).toBe('healthy');
    h.recordError('x');
    expect(h.recordError('x')).toBe('unavailable');
  });

  it('marks rate-limited and auth-required', () => {
    const h = new HealthRegistry();
    expect(h.recordError('r', 'rate-limit')).toBe('rate-limited');
    const a = new HealthRegistry();
    expect(a.recordError('a', 'auth')).toBe('auth-required');
  });

  it('marks degraded on a high error rate', () => {
    const h = new HealthRegistry();
    h.recordSuccess('x', 10);
    expect(h.recordError('x')).toBe('degraded');
  });

  it('recovers on success and reports error rate', () => {
    const h = new HealthRegistry();
    h.recordError('x');
    h.recordSuccess('x', 5); // resets consecutive failures + rate-limit/auth
    expect(h.statusOf('x')).toBe('healthy');
    const summary = h.summary();
    expect(summary['x'].errorRate).toBeCloseTo(0.5, 1);
  });

  it('exposes human labels', () => {
    expect(HEALTH_LABELS['rate-limited']).toBe('Rate Limited');
    expect(HEALTH_LABELS['auth-required']).toBe('Requires Authentication');
  });
});
