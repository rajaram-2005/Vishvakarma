'use client';
// SUTRA ⇄ Aetheris One. Aetheris is a local Intelligence OS by the same
// author (github.com/rajaram-2005/Aetheris). This page browses its
// capability registry and delegates prompts to its agent core over its
// local HTTP API. Purely optional — the workspace is complete without it.

import React, { useEffect, useState } from 'react';
import { Bot, ExternalLink, PlugZap, RefreshCw, SendHorizonal, Server } from 'lucide-react';
import { GlassPanel, SectionTitle } from '@/components/ui';
import { useSutra } from '@/lib/store';
import { aetherisCapabilities, aetherisChat, aetherisHealth } from '@/lib/aetheris';
import type { AetherisCapabilities, AetherisChatResult, AetherisHealth } from '@/lib/aetheris';
import { normalizeBaseUrl } from '@/lib/server';

export default function AetherisPage() {
  const { s, setSettings, act } = useSutra();
  const baseUrl = s.settings.aetheris?.baseUrl ?? 'http://localhost:3100';

  const [health, setHealth] = useState<AetherisHealth | null>(null);
  const [caps, setCaps] = useState<AetherisCapabilities | null>(null);
  const [probing, setProbing] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState<AetherisChatResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const probe = async (url?: string) => {
    const target = url ?? baseUrl;
    setProbing(true);
    setError(null);
    try {
      const h = await aetherisHealth(target);
      setHealth(h);
      setCaps(h?.ok ? await aetherisCapabilities(target) : null);
      if (!h) setError('Aetheris is not reachable. Start it locally (see below) and check the base URL.');
    } finally {
      setProbing(false);
    }
  };

  useEffect(() => {
    void probe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const delegate = async () => {
    const p = prompt.trim();
    if (!p || busy) return;
    setBusy(true);
    setError(null);
    setReply(null);
    try {
      const r = await aetherisChat(baseUrl, [{ role: 'user', content: p }]);
      if (!r) {
        setError('Delegation failed — is Aetheris running and the base URL correct?');
        return;
      }
      setReply(r);
      act('aetheris', 'delegated to Aetheris', `${r.content.length} chars${r.model ? ` · ${r.model}` : ''}`, undefined);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <SectionTitle
        overline="aetheris"
        title="Connected intelligence."
        sub="Aetheris One is your local Intelligence OS — capability registry, agent core and knowledge fabric. SUTRA treats it as an optional connected brain over its local HTTP API."
      />

      <GlassPanel className="p-5 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-mono text-[10px] tracking-widest" style={{ color: 'var(--acc2)' }}>BRIDGE</span>
          <span
            className="chip"
            style={{ color: health ? 'var(--ok)' : error ? 'var(--warn)' : 'var(--dim)' }}
          >
            {health ? `online · aetheris-one v${health.version}${health.uptime_s ? ` · up ${Math.round(health.uptime_s / 60)}m` : ''}` : probing ? 'probing…' : 'offline'}
          </span>
          <button onClick={() => void probe()} disabled={probing} className="btn-ghost !py-2 !px-3 text-xs disabled:opacity-50">
            <RefreshCw size={13} /> re-probe
          </button>
          {caps && (
            <span className="chip !text-[10px]" style={{ color: 'var(--acc2)' }}>
              {caps.count} capabilities registered
            </span>
          )}
        </div>

        <div className="flex flex-col md:flex-row gap-3">
          <label className="font-mono text-[10px] flex items-center gap-2 shrink-0 self-center" style={{ color: 'var(--dim)' }}>
            <Server size={12} /> base URL
          </label>
          <input
            value={baseUrl}
            onChange={(e) => setSettings({ aetheris: { baseUrl: normalizeBaseUrl(e.target.value) } })}
            className="glass-2 flex-1 px-4 py-2.5 font-mono text-xs outline-none"
            style={{ color: 'var(--ink)' }}
            placeholder="http://localhost:3100"
          />
          <button onClick={() => void probe()} disabled={probing} className="btn-ghost !py-2 !px-3 text-xs">
            <PlugZap size={13} /> test
          </button>
        </div>
        {error && <div className="font-mono text-[11px]" style={{ color: 'var(--warn)' }}>⚠ {error}</div>}

        <div className="text-xs leading-relaxed" style={{ color: 'var(--dim)' }}>
          Start Aetheris alongside SUTRA on another port:
          <pre className="mt-2 glass-2 rounded-lg p-3 font-mono text-[11px] overflow-x-auto" style={{ color: 'var(--acc2)' }}>
{`git clone https://github.com/rajaram-2005/Aetheris.git
cd Aetheris && npm ci && cp .env.example .env.local
npm run dev -- --hostname 127.0.0.1 -p 3100`}
          </pre>
          <a
            href="https://github.com/rajaram-2005/Aetheris"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 mt-1"
            style={{ color: 'var(--acc2)' }}
          >
            github.com/rajaram-2005/Aetheris <ExternalLink size={11} />
          </a>
        </div>
      </GlassPanel>

      <GlassPanel className="p-5 space-y-4">
        <div className="font-mono text-[10px] tracking-widest" style={{ color: 'var(--acc2)' }}>
          DELEGATE · prompt → Aetheris agent core (Prime planner → Hermes → Metis verifier)
        </div>
        <div className="flex flex-col md:flex-row gap-3">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void delegate();
              }
            }}
            rows={2}
            className="glass-2 flex-1 px-4 py-3 text-sm outline-none resize-y"
            style={{ color: 'var(--ink)' }}
            placeholder="e.g. Research SUTRA-style agent routing and propose a 3-step evaluation plan."
          />
          <button onClick={() => void delegate()} disabled={busy || !prompt.trim()} className="btn-primary self-start disabled:opacity-50">
            <SendHorizonal size={13} /> {busy ? 'delegating…' : 'delegate'}
          </button>
        </div>
        {reply && (
          <div className="glass-2 rounded-xl p-4 space-y-2">
            <div className="flex flex-wrap gap-2 items-center">
              <span className="chip !text-[9px]" style={{ color: 'var(--acc2)' }}>
                <Bot size={10} /> aetheris · {reply.model ?? 'agent core'}
              </span>
              {reply.provider && (
                <span className="chip !text-[9px]" style={{ color: 'var(--dim)' }}>
                  provider: {reply.provider}
                </span>
              )}
              {reply.offline && (
                <span className="chip !text-[9px]" style={{ color: 'var(--warn)' }}>
                  offline reply
                </span>
              )}
            </div>
            <div className="text-sm whitespace-pre-wrap leading-relaxed" style={{ color: 'var(--ink)' }}>
              {reply.content}
            </div>
          </div>
        )}
      </GlassPanel>

      <GlassPanel className="p-5">
        <div className="font-mono text-[10px] tracking-widest mb-3" style={{ color: 'var(--acc2)' }}>
          CAPABILITY REGISTRY {caps ? `· ${caps.count}` : ''}
        </div>
        {!caps ? (
          <div className="text-xs" style={{ color: 'var(--dim)' }}>
            {health ? 'Registry unreachable.' : 'Connect to Aetheris to browse its registry — models, agents, tools, MCP connectors and more.'}
          </div>
        ) : (
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-2 max-h-[420px] overflow-y-auto pr-1">
            {caps.capabilities.map((c) => (
              <div key={c.id} className="glass-2 rounded-lg p-3 border" style={{ borderColor: 'var(--line)' }}>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[11px] font-semibold" style={{ color: 'var(--ink)' }}>
                    {c.name ?? c.id}
                  </span>
                  {c.category && (
                    <span className="chip !text-[8px] ml-auto" style={{ color: 'var(--acc2)' }}>
                      {c.category}
                    </span>
                  )}
                </div>
                {c.description && (
                  <div className="text-[10px] mt-1 leading-relaxed" style={{ color: 'var(--dim)' }}>
                    {c.description.slice(0, 110)}
                  </div>
                )}
                {c.tags && c.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {c.tags.slice(0, 4).map((t) => (
                      <span key={t} className="font-mono text-[8px] px-1.5 py-0.5 rounded" style={{ background: 'var(--panel-2)', color: 'var(--dim)' }}>
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </GlassPanel>
    </div>
  );
}
