'use client';
// SUTRA — Settings: appearance, privacy, providers, Puter, data, about.

import React, { useRef, useState } from 'react';
import { ExternalLink, Trash2, Upload } from 'lucide-react';
import { useSutra } from '@/lib/store';
import { GlassPanel, SectionTitle, Toggle } from '@/components/ui';
import { usePuter } from '@/lib/puter';
import { providerFor } from '@/lib/providers';
import { PUTER_DOC_URL } from '@sutra/puter-adapter';
import { download } from '@sutra/shared';
import type { PrivacyMode, SyncScope, Theme } from '@sutra/shared';

export default function SettingsPage() {
  const { s, setSettings, exportAll, importAll, resetAll } = useSutra();
  const puter = usePuter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [connMsg, setConnMsg] = useState('');
  const p = s.settings.providers;

  const testOllama = async () => {
    setConnMsg('probing…');
    const prov = providerFor({ id: '__test', name: 'test', provider: 'x', runtime: 'ollama', contextWindow: 1, costIn: 0, costOut: 0, latencyTier: 'low', capabilities: [], available: true, local: true }, s.settings);
    const r = await prov!.ping();
    setConnMsg(r.ok ? `reachable · ${r.latencyMs}ms · ${r.detail ?? ''}` : `unreachable · ${r.detail ?? ''}`);
  };
  const testApi = async () => {
    setConnMsg('probing…');
    const prov = providerFor({ id: '__test', name: 'test', provider: 'x', runtime: 'openai-compat', contextWindow: 1, costIn: 0, costOut: 0, latencyTier: 'low', capabilities: [], available: true, local: false }, s.settings);
    const r = await prov!.ping();
    setConnMsg(r.ok ? `reachable · ${r.latencyMs}ms` : `unreachable · ${r.detail ?? ''}`);
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <SectionTitle overline="settings" title="Your rules. Your data. Your machine." />

      <GlassPanel className="p-5 space-y-5">
        <div className="font-mono text-[10px] tracking-widest" style={{ color: 'var(--acc2)' }}>APPEARANCE</div>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex gap-2">
            {(['dark', 'light', 'aurora'] as Theme[]).map((t) => (
              <button
                key={t}
                onClick={() => setSettings({ theme: t })}
                className="chip"
                style={{
                  cursor: 'pointer',
                  color: s.settings.theme === t ? 'var(--acc2)' : 'var(--dim)',
                  borderColor: s.settings.theme === t ? 'var(--acc2)' : 'var(--line)',
                  boxShadow: s.settings.theme === t ? '0 0 14px -4px var(--glow-b)' : 'none',
                }}
              >
                {t}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--dim)' }}>
            reduced motion
            <select
              value={s.settings.reducedMotion}
              onChange={(e) => setSettings({ reducedMotion: e.target.value as 'system' | 'on' | 'off' })}
              className="glass-2 px-3 py-1.5 text-xs outline-none"
              style={{ color: 'var(--ink)' }}
            >
              <option value="system">system</option>
              <option value="on">on</option>
              <option value="off">off</option>
            </select>
          </label>
          <Toggle on={s.settings.ambientSound} onChange={(v) => setSettings({ ambientSound: v })} label="ambient soundscape (off by default)" />
          <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--dim)' }}>
            volume
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={s.settings.ambientVolume}
              onChange={(e) => setSettings({ ambientVolume: Number(e.target.value) })}
              className="w-28"
            />
          </label>
        </div>
      </GlassPanel>

      <GlassPanel className="p-5 space-y-4">
        <div className="font-mono text-[10px] tracking-widest" style={{ color: 'var(--acc2)' }}>PRIVACY</div>
        <div className="flex flex-wrap gap-2">
          {(['local', 'hybrid', 'cloud'] as PrivacyMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setSettings({ privacyMode: m })}
              className="chip"
              style={{
                cursor: 'pointer',
                color: s.settings.privacyMode === m ? 'var(--ok)' : 'var(--dim)',
                borderColor: s.settings.privacyMode === m ? 'var(--ok)' : 'var(--line)',
              }}
            >
              {m}{m === 'local' && ' (default)'}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {(['none', 'metadata', 'projects', 'folders', 'workspace'] as SyncScope[]).map((sc) => (
            <button
              key={sc}
              onClick={() => setSettings({ syncScope: sc })}
              className="chip"
              style={{
                cursor: 'pointer',
                color: s.settings.syncScope === sc ? 'var(--acc2)' : 'var(--dim)',
                borderColor: s.settings.syncScope === sc ? 'var(--acc2)' : 'var(--line)',
              }}
            >
              sync: {sc === 'projects' ? 'selected projects' : sc === 'folders' ? 'selected folders' : sc}
            </button>
          ))}
        </div>
        <p className="text-xs leading-relaxed" style={{ color: 'var(--dim)' }}>
          Local mode keeps chat, models, agents, RAG, memory, files, tasks, workflows, coding and testing fully offline.
          Private data is never uploaded silently: every outbound request is policy-checked and appears in Activity.
        </p>
      </GlassPanel>

      <GlassPanel className="p-5 space-y-4">
        <div className="font-mono text-[10px] tracking-widest" style={{ color: 'var(--acc2)' }}>PROVIDERS</div>
        <Field label="ollama url (local runtime)">
          <div className="flex gap-2">
            <input
              value={p.ollamaUrl}
              onChange={(e) => setSettings({ providers: { ...p, ollamaUrl: e.target.value } })}
              className="glass-2 flex-1 px-3 py-2 text-sm font-mono outline-none"
              style={{ color: 'var(--ink)' }}
              placeholder="http://localhost:11434"
            />
            <button onClick={() => void testOllama()} className="btn-ghost !py-2 !px-3 text-xs">test</button>
          </div>
        </Field>
        <Field label="openai-compatible base url (vllm · lm studio · sglang · api)">
          <input
            value={p.openaiBaseUrl}
            onChange={(e) => setSettings({ providers: { ...p, openaiBaseUrl: e.target.value } })}
            className="glass-2 w-full px-3 py-2 text-sm font-mono outline-none"
            style={{ color: 'var(--ink)' }}
            placeholder="https://api.openai.com/v1  or  http://localhost:8000/v1"
          />
        </Field>
        <div className="grid md:grid-cols-2 gap-3">
          <Field label="api key (stored locally only)">
            <input
              type="password"
              value={p.openaiApiKey}
              onChange={(e) => setSettings({ providers: { ...p, openaiApiKey: e.target.value } })}
              className="glass-2 w-full px-3 py-2 text-sm font-mono outline-none"
              style={{ color: 'var(--ink)' }}
              placeholder="sk-…"
            />
          </Field>
          <Field label="model name">
            <input
              value={p.openaiModel}
              onChange={(e) => setSettings({ providers: { ...p, openaiModel: e.target.value } })}
              className="glass-2 w-full px-3 py-2 text-sm font-mono outline-none"
              style={{ color: 'var(--ink)' }}
              placeholder="gpt-4o-mini"
            />
          </Field>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => void testApi()} className="btn-ghost !py-2 !px-3 text-xs">test API endpoint</button>
          {connMsg && <span className="font-mono text-[10px]" style={{ color: connMsg.startsWith('reachable') ? 'var(--ok)' : 'var(--warn)' }}>{connMsg}</span>}
        </div>
        <Field label="OTLP endpoint (optional)">
          <input
            value={p.otlpEndpoint}
            onChange={(e) => setSettings({ providers: { ...p, otlpEndpoint: e.target.value } })}
            className="glass-2 w-full px-3 py-2 text-sm font-mono outline-none"
            style={{ color: 'var(--ink)' }}
            placeholder="http://localhost:4318/v1/traces"
          />
        </Field>
      </GlassPanel>

      <GlassPanel className="p-5 space-y-3">
        <div className="font-mono text-[10px] tracking-widest" style={{ color: 'var(--acc2)' }}>PUTER (OPTIONAL LAYER)</div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="chip" style={{ color: puter.signedIn ? 'var(--ok)' : 'var(--dim)' }}>
            {puter.scriptLoaded ? (puter.signedIn ? `signed in · ${puter.user ?? ''}` : 'script loaded · local mode') : 'script loading…'}
          </span>
          {puter.signedIn ? (
            <button onClick={() => void puter.disconnect()} className="btn-ghost !py-2 !px-3 text-xs">sign out</button>
          ) : (
            <button onClick={() => void puter.connect()} className="btn-primary !py-2 !px-3 text-xs">connect Puter</button>
          )}
          <a href={PUTER_DOC_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono text-[10px]" style={{ color: 'var(--dim)' }}>
            Powered by Puter <ExternalLink size={10} />
          </a>
        </div>
        <p className="text-xs" style={{ color: 'var(--dim)' }}>
          Used for KV persistence, cloud filesystem, auth, AI, hosting and task management — only when you opt in.
          Local mode never forces Puter authentication.
        </p>
      </GlassPanel>

      <GlassPanel className="p-5 space-y-3">
        <div className="font-mono text-[10px] tracking-widest" style={{ color: 'var(--acc2)' }}>DATA</div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => download('sutra-export.json', exportAll())} className="btn-ghost !py-2 !px-3 text-xs">export everything (JSON)</button>
          <button onClick={() => fileRef.current?.click()} className="btn-ghost !py-2 !px-3 text-xs">
            <Upload size={12} /> import
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              f.text().then((txt) => {
                const ok = importAll(txt);
                alert(ok ? 'Imported.' : 'Import failed — not a valid SUTRA export.');
              });
            }}
          />
          <button
            onClick={() => {
              if (confirm('Reset the whole workspace? This clears all local data.')) resetAll();
            }}
            className="btn-ghost !py-2 !px-3 text-xs"
            style={{ color: 'var(--bad)' }}
          >
            <Trash2 size={12} /> reset workspace
          </button>
        </div>
      </GlassPanel>

      <GlassPanel className="p-5">
        <div className="font-mono text-[10px] tracking-widest mb-3" style={{ color: 'var(--acc2)' }}>ABOUT</div>
        <div className="text-sm space-y-1.5">
          <div><span style={{ color: 'var(--dim)' }}>SUTRA</span> — Project 3 · v0.1.0</div>
          <div className="text-xs" style={{ color: 'var(--dim)' }}>
            The open AI ecosystem workspace. Local-first, provider-neutral, OpenTelemetry-compatible.
            <br />
            Surfaces: web (this) · desktop (Tauri) · mobile (React Native) · API (FastAPI).
          </div>
          <div className="text-xs font-mono" style={{ color: 'var(--dim)' }}>
            contact: <a href="mailto:ramkpraja175@gmail.com" className="hover:underline" style={{ color: 'var(--acc2)' }}>ramkpraja175@gmail.com</a> · <a href="tel:+91488407998" className="hover:underline" style={{ color: 'var(--acc2)' }}>+91 488407998</a>
          </div>
        </div>
      </GlassPanel>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="font-mono text-[9px] tracking-widest mb-1.5" style={{ color: 'var(--dim)' }}>{label.toUpperCase()}</div>
      {children}
    </div>
  );
}
