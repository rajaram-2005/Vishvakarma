# Aetherion service API — OpenTelemetry-compatible tracing (OTLP-flavored JSON).
# Works with no external collector: spans are kept in-process and exportable.
from __future__ import annotations

import time
import uuid
from dataclasses import dataclass, field


@dataclass
class Span:
    trace_id: str
    span_id: str
    parent_id: str | None
    name: str
    kind: str = "server"
    start_ms: int = 0
    end_ms: int = 0
    status: str = "ok"  # ok | error
    attrs: dict[str, str] = field(default_factory=dict)

    def to_otlp(self) -> dict:
        return {
            "traceId": self.trace_id,
            "spanId": self.span_id,
            "parentSpanId": self.parent_id,
            "name": self.name,
            "kind": _KIND.get(self.kind, 2),
            "startTimeUnixNano": str(self.start_ms * 1_000_000),
            "endTimeUnixNano": str(self.end_ms * 1_000_000),
            "status": {"code": 1 if self.status == "ok" else 2},
            "attributes": [
                {"key": k, "value": {"stringValue": str(v)}} for k, v in self.attrs.items()
            ],
        }


_KIND = {"server": 2, "client": 3, "producer": 3, "consumer": 4, "internal": 1}


class Tracer:
    """Collects spans; optional OTLP/HTTP export. Never blocks the request path."""

    def __init__(self, service: str = "sutra-api"):
        self.service = service
        self.spans: list[Span] = []
        self._cap = 5000

    def start(self, name: str, parent: Span | None = None, kind: str = "server", **attrs) -> Span:
        span = Span(
            trace_id=parent.trace_id if parent else uuid.uuid4().hex,
            span_id=uuid.uuid4().hex[:16],
            parent_id=parent.span_id if parent else None,
            name=name,
            kind=kind,
            start_ms=int(time.time() * 1000),
            attrs=dict(attrs),
        )
        self._push(span)
        return span

    def end(self, span: Span, status: str = "ok") -> Span:
        span.end_ms = int(time.time() * 1000)
        span.status = status
        return span

    def _push(self, span: Span) -> None:
        self.spans.append(span)
        if len(self.spans) > self._cap:
            self.spans = self.spans[-self._cap :]

    def resource_spans(self) -> dict:
        """Full OTLP/JSON resource-spans document (same shape as the web build)."""
        by_trace: dict[str, list[Span]] = {}
        for s in self.spans:
            by_trace.setdefault(s.trace_id, []).append(s)
        scope_spans = [
            {
                "scope": {"name": "sutra", "version": "0.1.0"},
                "spans": [s.to_otlp() for s in ss],
            }
            for ss in by_trace.values()
        ]
        return {
            "resourceSpans": [
                {
                    "resource": {
                        "attributes": [
                            {"key": "service.name", "value": {"stringValue": self.service}},
                            {"key": "service.version", "value": {"stringValue": "0.1.0"}},
                            {"key": "telemetry.sdk.name", "value": {"stringValue": "sutra"}},
                        ]
                    },
                    "scopeSpans": scope_spans,
                }
            ]
        }
