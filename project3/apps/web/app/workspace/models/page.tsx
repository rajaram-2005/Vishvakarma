'use client';
// SUTRA — Models: registry, connectivity tests, live router tester.

import React, { useState } from 'react';
import { Cpu, PlugZap } from 'lucide-react';
import { useSutra } from '@/lib/store';
import { GlassPanel, SectionTitle, Stat } from '@/components/ui';
import { route } from '@sutra/model-adapters';
import { providerFor, reachableModels } from '@/lib/providers';
import { usePuter, usePuterAi } from '@/lib/puter';
import { Cloud, RefreshCw } from 'lucide-react';

export default function ModelsPage() {
  const { s } = useSutra();
  const puter = usePuter();
  const puterAi = usePuterAi();
  const [ping, setPing] = useState<Record<string, { ok: boolean; ms: number; detail?: string } | 'busy'>>({});
  const [testPrompt, setTestPrompt] = useState('Write a TypeScript function that validates an email address');
  const [decision, setDecision] = useState<ReturnType<typeof route> | null>(null);

  const pool = reachableModels(s.models, s.settings);

  const test = async (id: string) => {
    const m = s.models.find((x) => x.id === id);
    if (!m) return;
    const p = providerFor(m, s.settings);
    if (!p) {
      setPing((x) => ({ ...x, [id]: { ok: false, ms: 0, detail: 'no browser adapter — run via services/api or the runtime directly' } }));
      return;
    }
    setPing((x) => ({ ...x, [id]: 'busy' }));
    const r = await p.ping();
    setPing((x) => ({ ...x, [id]: { ok: r.ok, ms: r.latencyMs, detail: r.detail } }));
  };

  return (
    <div className="space-y-6">
      <SectionTitle
        overline="models"
        title="Runtime-neutral model layer."
        sub="Every model declares its runtime adapter, context, cost and capabilities. Test connectivity for anything reachable from this surface."
      />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="registered" value={s.models.length} sub="across 8 runtimes" />
        <Stat label="reachable here" value={pool.length} sub="browser adapters: local · ollama · api" tone="ok" />
        <Stat label="runtimes" value="8" sub="ollama → tensorrt-llm" tone="acc2" />
        <Stat label="lock-in" value="0" sub="adapter interface · provider-neutral" tone="acc" />
      </div>

      <GlassPanel className="overflow-x-auto">
        <table className="w-full text-sm min-w-[760px]">
          <thead>
            <tr className="font-mono text-[10px] tracking-widest" style={{ color: 'var(--dim)' }}>
              <th className="text-left px-5 py-3">MODEL</th>
              <th className="text-left px-5 py-3">RUNTIME</th>
              <th className="text-left px-5 py-3">CTX</th>
              <th className="text-left px-5 py-3">CAPABILITIES</th>
              <th className="text-left px-5 py-3">COST /1K</th>
              <th className="text-left px-5 py-3">STATUS</th>
            </tr>
          </thead>
          <tbody>
            {s.models.map((m) => {
              const st = ping[m.id];
              const reachable = pool.some((x) => x.id === m.id);
              return (
                <tr key={m.id} className="border-t" style={{ borderColor: 'var(--line)' }}>
                  <td className="px-5 py-2.5 font-medium">
                    <div className="flex items-center gap-2">
                      <Cpu size={13} style={{ color: reachable ? 'var(--acc2)' : 'var(--dim)' }} />
                      {m.name}
                    </div>
                  </td>
                  <td className="px-5 py-2.5 font-mono text-xs" style={{ color: 'var(--acc2)' }}>{m.runtime}</td>
                  <td className="px-5 py-2.5 font-mono text-xs" style={{ color: 'var(--dim)' }}>{Math.round(m.contextWindow / 1000)}k</td>
                  <td className="px-5 py-2.5 text-xs max-w-[200px]" style={{ color: 'var(--dim)' }}>{m.capabilities.join(' · ')}</td>
                  <td className="px-5 py-2.5 font-mono text-xs">{m.costIn === 0 ? 'local' : `$${m.costIn}/$${m.costOut}`}</td>
                  <td className="px-5 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="chip !text-[9px]" style={{ color: reachable ? 'var(--ok)' : 'var(--dim)' }}>
                        {reachable ? 'reachable' : 'via service'}
                      </span>
                      <button onClick={() => void test(m.id)} className="chip !text-[9px]" style={{ cursor: 'pointer' }}>
                        <PlugZap size={9} /> test
                      </button>
                      {st === 'busy' && <span className="chip !text-[9px] animate-pulse-soft" style={{ color: 'var(--warn)' }}>probing…</span>}
                      {st && st !== 'busy' && (
                        <span className="chip !text-[9px]" style={{ color: st.ok ? 'var(--ok)' : 'var(--bad)' }}>
                          {st.ok ? `ok · ${st.ms}ms` : 'unreachable'}
                        </span>
                      )}
                    </div>
                    {st && st !== 'busy' && st.detail && <div className="font-mono text-[9px] mt-1 max-w-[220px] truncate" style={{ color: 'var(--dim)' }}>{st.detail}</div>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </GlassPanel>

      <GlassPanel className="p-5 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-mono text-[10px] tracking-widest" style={{ color: 'var(--acc2)' }}>
            PUTER AI GATEWAY · {puterAi.available ? 'connected' : puter.signedIn ? 'ready' : 'connect to browse'}
          </span>
          <span className="chip !text-[9px]" style={{ color: puterAi.available ? 'var(--ok)' : 'var(--dim)' }}>
            500+ models · billed to your Puter account · no API keys
          </span>
          {!puterAi.available && (
            <a href="/workspace/settings" className="font-mono text-[10px]" style={{ color: 'var(--acc2)' }}>
              connect Puter ↗
            </a>
          )}
          {puterAi.available && (
            <button onClick={() => void puterAi.loadModels()} disabled={puterAi.loadingModels} className="btn-ghost !py-2 !px-3 text-xs disabled:opacity-50">
              <RefreshCw size={12} /> {puterAi.loadingModels ? 'listing…' : 'refresh catalog'}
            </button>
          )}
        </div>
        {puterAi.available && puterAi.models && (
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-2 max-h-[360px] overflow-y-auto pr-1">
            {puterAi.models.slice(0, 60).map((m) => (
              <div key={m.id} className="glass-2 rounded-lg p-3 border" style={{ borderColor: 'var(--line)' }}>
                <div className="flex items-center gap-2">
                  <Cloud size={12} style={{ color: 'var(--acc2)' }} />
                  <span className="font-mono text-[11px] font-semibold truncate" style={{ color: 'var(--ink)' }}>{m.name}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-1.5">
                  <span className="chip !text-[8px]" style={{ color: 'var(--acc2)' }}>{m.provider}</span>
                  {m.contextWindow ? (
                    <span className="chip !text-[8px]" style={{ color: 'var(--dim)' }}>{Math.round(m.contextWindow / 1000)}k ctx</span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
        {puterAi.available && puterAi.modelsError && (
          <div className="font-mono text-[10px]" style={{ color: 'var(--warn)' }}>⚠ {puterAi.modelsError}</div>
        )}
        <p className="text-xs leading-relaxed" style={{ color: 'var(--dim)' }}>
          Pick any gateway model in Chat — the model selector lists them once you are signed in, and requests route
          through Puter's AI gateway straight to the provider.
        </p>
      </GlassPanel>

      <GlassPanel className="p-5">
        <div className="font-mono text-[10px] tracking-widest mb-3" style={{ color: 'var(--acc2)' }}>ROUTER TESTER</div>
        <div className="flex flex-col md:flex-row gap-3">
          <input value={testPrompt} onChange={(e) => setTestPrompt(e.target.value)} className="glass-2 flex-1 px-4 py-3 text-sm outline-none" style={{ color: 'var(--ink)' }} />
          <button onClick={() => setDecision(route(pool.length ? pool : s.models, testPrompt, { requireLocal: s.settings.privacyMode === 'local' }))} className="btn-primary self-start">
            Analyze + rank
          </button>
        </div>
        {decision && (
          <div className="mt-5 grid md:grid-cols-2 gap-4">
            <div className="glass-2 p-4">
              <div className="font-mono text-[10px] tracking-widest mb-2" style={{ color: 'var(--acc2)' }}>ANALYSIS</div>
              <div className="text-sm">{decision.analysis.label}</div>
              <div className="font-mono text-[10px] mt-1" style={{ color: 'var(--dim)' }}>{decision.analysis.charCount} chars</div>
              <div className="font-mono text-[10px] tracking-widest mt-4 mb-2" style={{ color: 'var(--acc2)' }}>CHOSEN</div>
              <div className="text-sm font-medium">
                {decision.chosen?.name} <span style={{ color: 'var(--dim)' }}>· {decision.chosen?.runtime}</span>
              </div>
            </div>
            <div className="glass-2 p-4">
              <div className="font-mono text-[10px] tracking-widest mb-2" style={{ color: 'var(--acc2)' }}>RANKING</div>
              <div className="space-y-2">
                {decision.ranking.map((r, i) => {
                  const m = s.models.find((x) => x.id === r.modelId);
                  return (
                    <div key={r.modelId + i} className="flex items-center gap-2 text-xs">
                      <span className="w-4 font-mono" style={{ color: 'var(--dim)' }}>{i + 1}</span>
                      <span className="w-32 truncate">{m?.name ?? r.modelId}</span>
                      <div className="flex-1 h-1 rounded-full" style={{ background: 'var(--panel-2)' }}>
                        <div className="h-full rounded-full" style={{ width: `${Math.min(100, r.score)}%`, background: 'linear-gradient(90deg, var(--acc), var(--acc2))' }} />
                      </div>
                      <span className="w-7 text-right font-mono text-[10px]" style={{ color: 'var(--dim)' }}>{r.score}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </GlassPanel>
    </div>
  );
}
