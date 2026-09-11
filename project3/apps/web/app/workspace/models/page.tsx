'use client';
// Aetherion — Models: registry, connectivity tests, live router tester.

import React, { useState } from 'react';
import { Cpu, PlugZap } from 'lucide-react';
import { useSutra } from '@/lib/store';
import { GlassPanel, SectionTitle, Stat } from '@/components/ui';
import { route } from '@sutra/model-adapters';
import { providerFor, reachableModels } from '@/lib/providers';
import { usePuter, usePuterAi } from '@/lib/puter';
import { Cloud, RefreshCw, Search } from 'lucide-react';
import { OWN_MODELS } from '@/lib/localmodels/registry';
import { PUTER_MODEL_CATALOG, mergePuterModels } from '@/lib/puter-models';

export default function ModelsPage() {
  const { s } = useSutra();
  const puter = usePuter();
  const puterAi = usePuterAi();
  const [ping, setPing] = useState<Record<string, { ok: boolean; ms: number; detail?: string } | 'busy'>>({});
  const [testPrompt, setTestPrompt] = useState('Write a TypeScript function that validates an email address');
  const [decision, setDecision] = useState<ReturnType<typeof route> | null>(null);
  const [gatewaySearch, setGatewaySearch] = useState('');
  const [gatewayShown, setGatewayShown] = useState(48);

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

      <GlassPanel className="p-5 space-y-3">
        <div className="font-mono text-[10px] tracking-widest" style={{ color: 'var(--acc2)' }}>
          OWN MODEL FAMILY · ON-DEVICE · ZERO NETWORK
        </div>
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-2.5">
          {OWN_MODELS.map((m) => (
            <div key={m.id} className="glass-2 rounded-xl p-3.5">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[11px] font-semibold" style={{ color: 'var(--ink)' }}>{m.name}</span>
                <span className="chip !text-[8px] ml-auto" style={{ color: 'var(--ok)' }}>offline ✓</span>
              </div>
              <div className="text-[10px] mt-1.5 leading-relaxed" style={{ color: 'var(--dim)' }}>{m.description.slice(0, 120)}</div>
            </div>
          ))}
        </div>
      </GlassPanel>

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
            PUTER AI GATEWAY · {PUTER_MODEL_CATALOG.length}+ MODELS
          </span>
          <span className="chip !text-[9px]" style={{ color: puter.signedIn ? 'var(--ok)' : 'var(--dim)' }}>
            {puter.signedIn
              ? puterAi.models
                ? `${puterAi.models.length} live · validated by the gateway`
                : 'live validation pending…'
              : 'sign in to live-validate · catalog browsable now'}
          </span>
          <span className="chip !text-[9px]" style={{ color: 'var(--dim)' }}>
            billed to your Puter account · no API keys
          </span>
          {!puter.signedIn && (
            <a href="/workspace/settings" className="font-mono text-[10px]" style={{ color: 'var(--acc2)' }}>
              connect Puter ↗
            </a>
          )}
          {puter.signedIn && (
            <button onClick={() => void puterAi.loadModels()} disabled={puterAi.loadingModels} className="btn-ghost !py-2 !px-3 text-xs disabled:opacity-50">
              <RefreshCw size={12} /> {puterAi.loadingModels ? 'listing…' : 'refresh live list'}
            </button>
          )}
        </div>

        {(() => {
          const liveIds = new Set((puterAi.models ?? []).map((m) => m.id));
          const merged = mergePuterModels(puterAi.models ?? []);
          const q = gatewaySearch.trim().toLowerCase();
          const filtered = q
            ? merged.filter((m) => m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q) || m.provider.toLowerCase().includes(q))
            : merged;
          const shown = filtered.slice(0, gatewayShown);
          return (
            <>
              <div className="pill-input">
                <Search size={14} style={{ color: 'var(--dim)' }} />
                <input
                  value={gatewaySearch}
                  onChange={(e) => { setGatewaySearch(e.target.value); setGatewayShown(48); }}
                  placeholder={`search ${PUTER_MODEL_CATALOG.length}+ gateway models (gpt, claude, gemini, llama, qwen…)`}
                />
              </div>
              <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-2 max-h-[420px] overflow-y-auto pr-1">
                {shown.map((m) => {
                  const live = liveIds.has(m.id);
                  return (
                    <div key={m.id} className="glass-2 rounded-lg p-3 border" style={{ borderColor: live ? 'color-mix(in srgb, var(--ok) 35%, var(--line))' : 'var(--line)' }}>
                      <div className="flex items-center gap-2">
                        <Cloud size={12} style={{ color: live ? 'var(--ok)' : 'var(--acc2)' }} />
                        <span className="font-mono text-[11px] font-semibold truncate" style={{ color: 'var(--ink)' }}>{m.name}</span>
                        <span className="chip !text-[8px] ml-auto shrink-0" style={{ color: live ? 'var(--ok)' : 'var(--dim)' }}>
                          {live ? 'live · validated' : 'catalog'}
                        </span>
                      </div>
                      <div className="font-mono text-[9px] mt-0.5 truncate" style={{ color: 'var(--dim)' }}>{m.id}</div>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                        <span className="chip !text-[8px]" style={{ color: 'var(--acc2)' }}>{m.provider}</span>
                        {m.contextWindow > 0 && (
                          <span className="chip !text-[8px]" style={{ color: 'var(--dim)' }}>{Math.round(m.contextWindow / 1000)}k ctx</span>
                        )}
                        {m.costIn > 0 && (
                          <span className="chip !text-[8px]" style={{ color: 'var(--dim)' }}>${m.costIn}/${m.costOut} /1M</span>
                        )}
                        {m.capabilities.slice(0, 2).map((c) => (
                          <span key={c} className="chip !text-[8px]" style={{ color: 'var(--dim)' }}>{c}</span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center justify-between">
                <div className="text-[10px] font-mono" style={{ color: 'var(--dim)' }}>
                  {filtered.length} of {PUTER_MODEL_CATALOG.length} shown{q ? ` for “${gatewaySearch}”` : ''}
                </div>
                {filtered.length > gatewayShown && (
                  <button onClick={() => setGatewayShown((n) => n + 96)} className="chip hover:opacity-100 !text-[10px]" style={{ color: 'var(--acc2)' }}>
                    show more ({filtered.length - gatewayShown} left)
                  </button>
                )}
              </div>
            </>
          );
        })()}

        {puterAi.modelsError && (
          <div className="font-mono text-[10px]" style={{ color: 'var(--warn)' }}>⚠ {puterAi.modelsError}</div>
        )}
        <p className="text-xs leading-relaxed" style={{ color: 'var(--dim)' }}>
          The catalog lists {PUTER_MODEL_CATALOG.length}+ models Puter's AI gateway exposes (OpenAI, Anthropic, Google, Meta, Mistral, xAI, DeepSeek and
          40+ other providers). Every id is re-validated against the live puter.ai.listModels() result when you are signed in — live models get the
          “live · validated” badge. Pick any of them in Chat once connected; requests route through the gateway straight to the provider.
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
