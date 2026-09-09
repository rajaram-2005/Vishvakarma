import { describe, expect, it } from 'vitest';
import { toOtlpJson, type Span } from '@sutra/shared';

const T0 = Date.parse('2026-01-01T00:00:00Z');

const spans: Span[] = [
  { id: 's1', traceId: 't1', name: 'chat.request', kind: 'server', start: T0, end: T0 + 412, status: 'ok', attrs: { 'sutra.surface': 'chat' } },
  { id: 's2', traceId: 't1', name: 'model.route', kind: 'internal', start: T0 + 2, end: T0 + 18, status: 'ok', attrs: { model: 'sutra-local' } },
  { id: 's3', traceId: 't1', name: 'tool.exec', kind: 'client', start: T0 + 20, end: T0 + 120, status: 'error', attrs: { tool: 'terminal.exec' } },
];

describe('toOtlpJson', () => {
  it('produces an OTLP-shaped resource spans document', () => {
    const j = toOtlpJson(spans, 'sutra-test');
    expect(j.resourceSpans).toHaveLength(1);
    const rs = j.resourceSpans[0];
    const resourceJson = JSON.stringify(rs.resource);
    expect(resourceJson).toContain('sutra-test');
    expect(rs.scopeSpans.length).toBeGreaterThan(0);
    const allSpans = rs.scopeSpans.flatMap((s) => s.spans);
    expect(allSpans).toHaveLength(3);
    const names = allSpans.map((s) => s.name);
    expect(names).toEqual(['chat.request', 'model.route', 'tool.exec']);
  });

  it('maps span timing to nanoseconds and status codes', () => {
    const j = toOtlpJson(spans);
    const allSpans = j.resourceSpans[0].scopeSpans.flatMap((s) => s.spans);
    const [root, , err] = allSpans;
    expect(Number(root.startTimeUnixNano)).toBe(T0 * 1_000_000);
    expect(Number(root.endTimeUnixNano) - Number(root.startTimeUnixNano)).toBe(412 * 1_000_000);
    expect(root.status.code).toBe(1); // OK
    expect(err.status.code).toBe(2); // ERROR
  });

  it('carries attributes as OTLP any-value strings', () => {
    const j = toOtlpJson(spans);
    const allSpans = j.resourceSpans[0].scopeSpans.flatMap((s) => s.spans);
    const attr = allSpans[0].attributes?.find((a) => a.key === 'sutra.surface');
    expect(attr?.value.stringValue).toBe('chat');
  });
});
