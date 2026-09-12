'use client';
// Lumen — trace waterfall (works for live and sample traces).

import React from 'react';
import type { Trace } from '@sutra/shared';

export function TraceWaterfall({ trace }: { trace: Trace }) {
  const total = Math.max(1, trace.end - trace.start);
  return (
    <div className="space-y-1.5">
      {trace.spans.map((s) => {
        const left = ((s.start - trace.start) / total) * 100;
        const width = Math.max(1.2, ((s.end - s.start) / total) * 100);
        const bad = s.status === 'error';
        return (
          <div key={s.id} className="flex items-center gap-3">
            <div className="w-44 md:w-56 shrink-0 flex items-center gap-2 min-w-0">
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ background: bad ? 'var(--bad)' : 'var(--acc2)', boxShadow: bad ? '0 0 8px var(--bad)' : '0 0 8px var(--acc2)' }}
              />
              <span className="font-mono text-[11px] truncate" style={{ color: bad ? 'var(--bad)' : 'var(--ink)' }}>
                {s.name}
              </span>
            </div>
            <div className="flex-1 h-4 relative rounded" style={{ background: 'var(--panel-2)' }}>
              <div
                className="absolute top-[3px] bottom-[3px] rounded"
                style={{
                  left: `${left}%`,
                  width: `${width}%`,
                  background: bad
                    ? 'linear-gradient(90deg, var(--bad), color-mix(in srgb, var(--bad) 50%, transparent))'
                    : 'linear-gradient(90deg, var(--acc), var(--acc2))',
                  boxShadow: bad ? '0 0 10px color-mix(in srgb, var(--bad) 60%, transparent)' : '0 0 10px var(--glow-b)',
                }}
              />
            </div>
            <div className="w-14 text-right font-mono text-[10px] shrink-0" style={{ color: 'var(--dim)' }}>
              {Math.max(1, Math.round(s.end - s.start))}ms
            </div>
          </div>
        );
      })}
      <div className="flex items-center gap-3 pt-1">
        <div className="w-44 md:w-56 font-mono text-[10px] tracking-widest shrink-0" style={{ color: 'var(--dim)' }}>
          {trace.name} · {trace.spans.length} spans
        </div>
        <div className="flex-1 font-mono text-[10px]" style={{ color: 'var(--dim)' }}>
          total {Math.round(total)}ms
        </div>
      </div>
    </div>
  );
}
