import { describe, expect, it } from 'vitest';
import { analyzeRequest, route } from '@sutra/model-adapters';
import { CODE_MODEL, LOCAL, model } from './helpers';

describe('analyzeRequest', () => {
  it('detects code intent', () => {
    const a = analyzeRequest('Refactor this: function validateEmail(a) { … } — there is a bug, here is the stack trace');
    expect(a.intents).toContain('code');
    expect(a.charCount).toBeGreaterThan(0);
  });

  it('detects long-context intent for big payloads (>6000 chars)', () => {
    const big = 'summarize this document. '.repeat(500);
    const a = analyzeRequest(big);
    expect(big.length).toBeGreaterThan(6000);
    expect(a.intents).toContain('long-context');
  });

  it('marks privacy-required requests', () => {
    const a = analyzeRequest('draft this', true);
    expect(a.needsLocal).toBe(true);
  });
});

describe('route', () => {
  const pool = [LOCAL, CODE_MODEL];

  it('always returns a ranking and a chosen model', () => {
    const d = route(pool, 'hello', {});
    expect(d.ranking.length).toBeGreaterThan(0);
    expect(d.chosen).not.toBeNull();
    expect(d.ranking[0].score).toBeGreaterThanOrEqual(d.ranking[d.ranking.length - 1].score);
  });

  it('prefers better-profiled models for code prompts', () => {
    const d = route(pool, 'Refactor this: function f() { … } — fix the bug', {});
    expect(d.analysis.intents).toContain('code');
    expect(d.chosen?.id).toBe('coder-7b'); // wider context wins the tie
  });

  it('honors forceModel and pins it first with score 100', () => {
    const d = route(pool, 'anything', { forceModel: 'sutra-local' });
    expect(d.chosen?.id).toBe('sutra-local');
    expect(d.ranking[0].modelId).toBe('sutra-local');
    expect(d.ranking[0].score).toBe(100);
  });

  it('falls back to an available model when nothing matches', () => {
    const x = model({ id: 'fallback-x', capabilities: [] });
    const d = route([x], 'anything', {});
    expect(d.chosen?.id).toBe('fallback-x');
  });
});
