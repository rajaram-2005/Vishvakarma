// SUTRA — OpenTelemetry-compatible span export (OTLP-flavored JSON).
import type { Span } from './types';

export interface OtlpResourceSpans {
  resourceSpans: Array<{
    resource: { attributes: Array<{ key: string; value: { stringValue: string } }> };
    scopeSpans: Array<{
      scope: { name: string; version: string };
      spans: Array<{
        traceId: string;
        spanId: string;
        parentSpanId?: string;
        name: string;
        kind: number;
        startTimeUnixNano: string;
        endTimeUnixNano: string;
        status: { code: number };
        attributes: Array<{ key: string; value: { stringValue: string } }>;
      }>;
    }>;
  }>;
}

const toHexId = (id: string, len: number): string => {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let out = '';
  let x = h || 1;
  while (out.length < len) {
    out += (x % 16).toString(16);
    x = (x * 1103515245 + 12345) >>> 0;
  }
  return out.slice(0, len);
};

export function toOtlpJson(spans: Span[], serviceName = 'sutra-web'): OtlpResourceSpans {
  const byTrace = new Map<string, Span[]>();
  for (const s of spans) {
    const a = byTrace.get(s.traceId) ?? [];
    a.push(s);
    byTrace.set(s.traceId, a);
  }
  const scopeSpans: OtlpResourceSpans['resourceSpans'][number]['scopeSpans'] = [];
  for (const [traceId, list] of byTrace) {
    scopeSpans.push({
      scope: { name: 'sutra', version: '0.1.0' },
      spans: list.map((s) => ({
        traceId: toHexId(traceId, 32),
        spanId: toHexId(s.id, 16),
        name: s.name,
        kind: 2,
        startTimeUnixNano: String(Math.floor(s.start * 1e6)),
        endTimeUnixNano: String(Math.floor(s.end * 1e6)),
        status: { code: s.status === 'ok' ? 1 : 2 },
        attributes: Object.entries(s.attrs).map(([key, value]) => ({
          key,
          value: { stringValue: String(value) },
        })),
      })),
    });
  }
  return {
    resourceSpans: [
      {
        resource: {
          attributes: [
            { key: 'service.name', value: { stringValue: serviceName } },
            { key: 'service.version', value: { stringValue: '0.1.0' } },
            { key: 'telemetry.sdk.name', value: { stringValue: 'sutra' } },
            { key: 'telemetry.sdk.language', value: { stringValue: 'web' } },
          ],
        },
        scopeSpans,
      },
    ],
  };
}
