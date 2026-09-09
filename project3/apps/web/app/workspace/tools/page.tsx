'use client';
// SUTRA — Tools: registry, enable/disable, sandbox levels, live gateway samples.

import React, { useState } from 'react';
import { useSutra } from '@/lib/store';
import { GlassPanel, SectionTitle, RiskBadge, Toggle, LogConsole } from '@/components/ui';
import { createGateway, type ToolCall } from '@sutra/tool-adapters';
import { useSessionAllowed } from '@/lib/store';

const SAMPLES: Record<string, ToolCall> = {
  'fs.read': { tool: 'fs.read', category: 'fs.read', detail: 'read src/core.ts' },
  'fs.write': { tool: 'fs.write', category: 'fs.write', detail: 'write src/utils.ts' },
  'terminal.exec': { tool: 'terminal.exec', category: 'terminal.exec', detail: 'npm test' },
  'browser.nav': { tool: 'browser.nav', category: 'browser.action', detail: 'navigate sutra://local/preview' },
  'git.ops': { tool: 'git.ops', category: 'git.push', detail: 'git push origin main' },
  'api.fetch': { tool: 'api.fetch', category: 'network.request', detail: 'GET https://api.github.com' },
  'db.query': { tool: 'db.query', category: 'db.write', detail: 'UPDATE tasks SET status=done' },
  'docs.read': { tool: 'docs.read', category: 'fs.read', detail: 'parse docs/ARCHITECTURE.md' },
  'code.exec': { tool: 'code.exec', category: 'code.exec', detail: 'node dist/check.js' },
  'computer.use': { tool: 'computer.use', category: 'computer.use', detail: 'click(412, 88)' },
  'deploy.run': { tool: 'deploy.run', category: 'deploy', detail: 'deploy bundle to local target' },
};

export default function ToolsPage() {
  const { s, mutate } = useSutra();
  const session = useSessionAllowed();
  const gateway = createGateway();
  const [verdicts, setVerdicts] = useState<Record<string, { risk: string; allowed: boolean; needsApproval: boolean; reasons: string[] }>>({});

  const toggle = (id: string) =>
    mutate((st) => ({ ...st, tools: st.tools.map((t) => (t.id === id ? { ...t, enabled: !t.enabled } : t)) }));

  const sample = (id: string) => {
    const call = SAMPLES[id];
    if (!call) return;
    const v = gateway.check(call, session);
    setVerdicts((x) => ({ ...x, [id]: v }));
  };

  return (
    <div className="space-y-6">
      <SectionTitle
        overline="tools"
        title="The arsenal — declared, gated, audited."
        sub="Every tool declares risk and sandbox level. The gateway re-classifies each call at execution time. Try a sample call and watch the verdict."
      />
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
        {s.tools.map((t) => {
          const v = verdicts[t.id];
          return (
            <GlassPanel key={t.id} className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-medium text-sm">{t.name}</span>
                <RiskBadge risk={t.risk} />
              </div>
              <div className="text-[11px] mb-3" style={{ color: 'var(--dim)' }}>{t.description}</div>
              <div className="flex flex-wrap gap-1.5 mb-3">
                <span className="chip !text-[9px]">{t.category}</span>
                <span className="chip !text-[9px]" style={{ color: 'var(--acc2)' }}>sandbox: {t.sandbox}</span>
                {t.scopes.map((sc) => (
                  <span key={sc} className="chip !text-[9px]">{sc}</span>
                ))}
              </div>
              <div className="flex items-center justify-between gap-2">
                <Toggle on={t.enabled} onChange={() => toggle(t.id)} label={t.enabled ? 'enabled' : 'disabled'} />
                <button onClick={() => sample(t.id)} className="btn-ghost !py-1.5 !px-3 text-[10px]">
                  sample call
                </button>
              </div>
              {v && (
                <div className="mt-3 glass-2 p-3">
                  <div className="flex items-center gap-2 text-xs">
                    <RiskBadge risk={v.risk as never} />
                    <span style={{ color: v.needsApproval ? 'var(--warn)' : 'var(--ok)' }}>
                      {v.needsApproval ? '→ needs approval (see Security)' : '→ allowed'}
                    </span>
                  </div>
                  <div className="mt-1.5 space-y-0.5">
                    {v.reasons.map((r) => (
                      <div key={r} className="font-mono text-[10px]" style={{ color: 'var(--dim)' }}>· {r}</div>
                    ))}
                  </div>
                </div>
              )}
            </GlassPanel>
          );
        })}
      </div>
      <GlassPanel className="p-4">
        <div className="font-mono text-[10px] tracking-widest mb-2" style={{ color: 'var(--acc2)' }}>SESSION GRANTS</div>
        {session.size ? (
          <div className="flex flex-wrap gap-2">
            {[...session].map((c) => (
              <span key={c} className="chip" style={{ color: 'var(--ok)' }}>{c} · allowed this session</span>
            ))}
          </div>
        ) : (
          <div className="text-xs" style={{ color: 'var(--dim)' }}>no session grants — approvals expire when the session ends</div>
        )}
      </GlassPanel>
    </div>
  );
}
