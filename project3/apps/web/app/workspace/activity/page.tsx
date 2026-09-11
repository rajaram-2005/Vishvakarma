'use client';
// Lumen — Activity: unified timeline + trace waterfall drill-down.

import React, { useMemo, useState } from 'react';
import { useSutra } from '@/lib/store';
import { GlassPanel, SectionTitle, Modal, SearchBox } from '@/components/ui';
import { TraceWaterfall } from '@/components/workspace/TraceWaterfall';
import { timeAgo } from '@sutra/shared';
import type { Trace } from '@sutra/shared';

export default function ActivityPage() {
  const { s } = useSutra();
  const [kind, setKind] = useState('all');
  const [q, setQ] = useState('');
  const [traceOpen, setTraceOpen] = useState<Trace | null>(null);

  const kinds = useMemo(() => ['all', ...Array.from(new Set(s.activity.map((a) => a.kind)))], [s.activity]);

  const list = s.activity.filter(
    (a) =>
      (kind === 'all' || a.kind === kind) &&
      (!q || `${a.title} ${a.detail}`.toLowerCase().includes(q.toLowerCase())),
  );

  return (
    <div className="space-y-6">
      <SectionTitle
        overline="activity"
        title="Everything that happened, in order."
        sub="Chat, agents, tools, workflows, security decisions and deploys — one timeline. Any entry with a trace opens the full waterfall."
      />
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1.5">
          {kinds.map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className="chip"
              style={{
                cursor: 'pointer',
                color: kind === k ? 'var(--acc2)' : 'var(--dim)',
                borderColor: kind === k ? 'var(--acc2)' : 'var(--line)',
              }}
            >
              {k}
            </button>
          ))}
        </div>
        <div className="w-64">
          <SearchBox value={q} onChange={setQ} placeholder="filter events…" />
        </div>
        <span className="font-mono text-[10px] ml-auto" style={{ color: 'var(--dim)' }}>{list.length} events · {s.traces.length} traces</span>
      </div>

      <GlassPanel className="p-5">
        <div className="space-y-2">
          {list.map((a) => (
            <div key={a.id} className="flex items-start gap-3 text-xs border-b pb-2" style={{ borderColor: 'var(--line)' }}>
              <span className="chip !text-[9px] shrink-0 mt-0.5">{a.kind}</span>
              <div className="min-w-0 flex-1">
                <span className="font-medium">{a.title}</span>
                <span className="ml-2" style={{ color: 'var(--dim)' }}>{a.detail}</span>
              </div>
              {a.traceId && s.traces.some((t) => t.id === a.traceId) && (
                <button
                  onClick={() => setTraceOpen(s.traces.find((t) => t.id === a.traceId) ?? null)}
                  className="chip !text-[9px] shrink-0"
                  style={{ cursor: 'pointer', color: 'var(--acc2)' }}
                >
                  trace ↗
                </button>
              )}
              <span className="font-mono text-[10px] shrink-0" style={{ color: 'var(--dim)' }}>{timeAgo(a.ts)}</span>
            </div>
          ))}
          {!list.length && <div className="text-sm py-6 text-center" style={{ color: 'var(--dim)' }}>no matching events.</div>}
        </div>
      </GlassPanel>

      <Modal open={!!traceOpen} onClose={() => setTraceOpen(null)} title={traceOpen ? `trace · ${traceOpen.name}` : ''} wide>
        {traceOpen && <TraceWaterfall trace={traceOpen} />}
      </Modal>
    </div>
  );
}
