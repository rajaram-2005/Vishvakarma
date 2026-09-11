'use client';
// Aetherion — MCP servers: discovery, install, permissions, health, audit.

import React, { useState } from 'react';
import { Plug, RefreshCw } from 'lucide-react';
import { useSutra } from '@/lib/store';
import { GlassPanel, SectionTitle } from '@/components/ui';
import { timeAgo } from '@sutra/shared';

export default function McpPage() {
  const { s, mutate, act } = useSutra();
  const [checking, setChecking] = useState<Record<string, boolean>>({});

  const toggleInstalled = (id: string) =>
    mutate((st) => ({ ...st, mcp: st.mcp.map((m) => (m.id === id ? { ...m, installed: !m.installed } : m)) }));

  const healthCheck = async (id: string) => {
    const m = s.mcp.find((x) => x.id === id);
    if (!m) return;
    setChecking((c) => ({ ...c, [id]: true }));
    let status: 'healthy' | 'degraded' | 'offline' = 'offline';
    if (m.transport === 'http' && m.url) {
      try {
        const r = await fetch(m.url, { method: 'GET', signal: AbortSignal.timeout(5000) });
        status = r.status < 500 ? (r.ok ? 'healthy' : 'degraded') : 'offline';
      } catch {
        status = 'offline';
      }
    } else {
      // stdio servers need a local runtime (desktop / API service)
      status = m.installed ? 'healthy' : 'offline';
    }
    mutate((st) => ({
      ...st,
      mcp: st.mcp.map((x) => (x.id === id ? { ...x, status, lastCheck: new Date().toISOString() } : x)),
    }));
    act('mcp', `health check · ${m.name}`, status);
    setChecking((c) => ({ ...c, [id]: false }));
  };

  const audit = s.activity.filter((a) => a.kind === 'mcp');

  return (
    <div className="space-y-6">
      <SectionTitle
        overline="model context protocol"
        title="Servers with identity, scopes and health."
        sub="Discover, install with explicit permissions, check health, audit every tool call and pin versions. Local adapters run in-process; remote servers speak MCP over stdio/HTTP."
      />
      <div className="grid md:grid-cols-2 gap-3">
        {s.mcp.map((m) => (
          <GlassPanel key={m.id} className="p-4">
            <div className="flex items-center gap-2">
              <Plug size={14} style={{ color: m.installed ? 'var(--acc2)' : 'var(--dim)' }} />
              <span className="font-medium text-sm">{m.name}</span>
              <span
                className="w-2 h-2 rounded-full"
                style={{
                  background: m.status === 'healthy' ? 'var(--ok)' : m.status === 'degraded' ? 'var(--warn)' : 'var(--bad)',
                  boxShadow: `0 0 8px ${m.status === 'healthy' ? 'var(--ok)' : 'transparent'}`,
                }}
              />
              <span className="chip !text-[9px] ml-auto">{m.version}</span>
            </div>
            <div className="font-mono text-[10px] mt-2" style={{ color: 'var(--dim)' }}>
              {m.transport}{m.command ? ` · ${m.command}` : ''}{m.url ? ` · ${m.url}` : ''}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {m.tools.map((t) => (
                <span key={t.name} className="chip !text-[9px]">{t.name}</span>
              ))}
              {m.scopes.map((sc) => (
                <span key={sc} className="chip !text-[9px]" style={{ color: 'var(--acc)' }}>{sc}</span>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-2">
              <button onClick={() => toggleInstalled(m.id)} className={m.installed ? 'btn-ghost !py-1.5 !px-3 text-[10px]' : 'btn-primary !py-1.5 !px-3 text-[10px]'}>
                {m.installed ? 'uninstall' : 'install'}
              </button>
              <button onClick={() => void healthCheck(m.id)} disabled={checking[m.id]} className="btn-ghost !py-1.5 !px-3 text-[10px]">
                <RefreshCw size={10} className={checking[m.id] ? 'animate-spin' : ''} /> {checking[m.id] ? 'checking…' : 'health check'}
              </button>
              {m.lastCheck && <span className="font-mono text-[9px] ml-auto" style={{ color: 'var(--dim)' }}>last: {timeAgo(m.lastCheck)}</span>}
            </div>
          </GlassPanel>
        ))}
      </div>
      <GlassPanel className="p-5">
        <div className="font-mono text-[10px] tracking-widest mb-3" style={{ color: 'var(--acc2)' }}>AUDIT · MCP EVENTS</div>
        {audit.length ? (
          <div className="space-y-1.5">
            {audit.slice(0, 10).map((a) => (
              <div key={a.id} className="flex items-center gap-3 text-xs">
                <span className="chip !text-[9px]">{timeAgo(a.ts)}</span>
                <span>{a.title}</span>
                <span style={{ color: 'var(--dim)' }}>{a.detail}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-xs" style={{ color: 'var(--dim)' }}>
            no MCP events yet — run a health check. Every tool call through a server lands in this audit and in Activity.
          </div>
        )}
      </GlassPanel>
    </div>
  );
}
