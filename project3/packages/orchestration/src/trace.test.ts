import { describe, it, expect } from 'vitest';
import { Tracer } from './trace';

describe('Tracer', () => {
  it('records traces and spans', () => {
    const t = new Tracer();
    const tb = t.start('op');
    const s = tb.span('step', { k: 'v' });
    s.end('ok', { extra: '1' });
    const trace = tb.end('ok');
    expect(trace.spans).toHaveLength(1);
    expect(trace.spans[0].name).toBe('step');
    expect(trace.spans[0].status).toBe('ok');
    expect(trace.spans[0].attrs).toMatchObject({ k: 'v', extra: '1' });
    expect(trace.spans[0].end).toBeGreaterThanOrEqual(trace.spans[0].start);
    expect(t.get(trace.id)).toBeDefined();
    expect(t.all()).toHaveLength(1);
  });

  it('marks error spans', () => {
    const t = new Tracer();
    const tb = t.start('op');
    const s = tb.span('x');
    s.end('error');
    const trace = tb.end('error');
    expect(trace.status).toBe('error');
    expect(trace.spans[0].status).toBe('error');
  });

  it('exports OTLP-compatible JSON with hex ids', () => {
    const t = new Tracer();
    const tb = t.start('op');
    tb.span('a').end('ok');
    tb.end('ok');
    const otlp = t.toOtlpJson();
    const span = otlp.resourceSpans[0].scopeSpans[0].spans[0];
    expect(span.traceId).toHaveLength(32);
    expect(span.spanId).toHaveLength(16);
    expect(span.status.code).toBe(1);
    expect(otlp.resourceSpans[0].resource.attributes.some((a) => a.key === 'service.name')).toBe(true);
  });

  it('setAttr mutates span attributes', () => {
    const t = new Tracer();
    const tb = t.start('op');
    const s = tb.span('a');
    s.setAttr('model', 'gpt');
    s.end();
    expect(tb.trace.spans[0].attrs.model).toBe('gpt');
  });
});
