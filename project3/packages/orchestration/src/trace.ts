// §63 — Observability 2.0.
//
// Every important operation receives a trace ID with nested spans. The span
// shape reuses the shared @sutra/shared contract so web and API agree, and
// exports are OTLP-compatible.

import { uid, toOtlpJson, type Span, type Trace } from '@sutra/shared';

export interface SpanHandle {
  /** Close the span. `moreAttrs` is merged into the span attributes. */
  end(status?: Span['status'], moreAttrs?: Record<string, string>): Span;
  /** Mutate a span attribute in place. */
  setAttr(key: string, value: string | number): void;
  readonly span: Span;
}

export class TraceBuilder {
  private spans: Span[] = [];

  constructor(
    private readonly tracer: Tracer,
    public readonly trace: Trace,
  ) {}

  /** Open a span. Spans are siblings by default; nest by ordering calls. */
  span(name: string, attrs: Record<string, string> = {}): SpanHandle {
    const s: Span = {
      id: uid('sp'),
      traceId: this.trace.id,
      name,
      kind: 'internal',
      start: Date.now(),
      end: 0,
      status: 'ok',
      attrs,
    };
    this.spans.push(s);
    return {
      span: s,
      end: (status: Span['status'] = 'ok', moreAttrs: Record<string, string> = {}) => {
        s.end = Date.now();
        s.status = status;
        s.attrs = { ...s.attrs, ...moreAttrs };
        this.trace.spans = [...this.spans];
        return s;
      },
      setAttr: (key, value) => {
        s.attrs = { ...s.attrs, [key]: String(value) };
      },
    };
  }

  /** Close the trace. Returns the immutable Trace. */
  end(status: Trace['status'] = 'ok'): Trace {
    this.trace.end = Date.now();
    this.trace.status = status;
    this.trace.spans = [...this.spans];
    this.tracer.record(this.trace);
    return this.trace;
  }
}

export class Tracer {
  private traces = new Map<string, Trace>();

  start(name: string): TraceBuilder {
    const trace: Trace = {
      id: uid('TASK'),
      name,
      start: Date.now(),
      end: 0,
      status: 'ok',
      spans: [],
    };
    this.traces.set(trace.id, trace);
    return new TraceBuilder(this, trace);
  }

  get(id: string): Trace | undefined {
    return this.traces.get(id);
  }

  all(): Trace[] {
    return [...this.traces.values()];
  }

  record(trace: Trace): void {
    this.traces.set(trace.id, trace);
  }

  /** OTLP-flavored JSON export of every recorded trace. */
  toOtlpJson(serviceName = 'sutra-orchestration'): ReturnType<typeof toOtlpJson> {
    return toOtlpJson(
      [...this.traces.values()].flatMap((t) => t.spans),
      serviceName,
    );
  }
}
