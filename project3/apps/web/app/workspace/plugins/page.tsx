'use client';
// Aetherion — Plugins: manifest-first, scope-reviewed, revocable.

import React, { useMemo, useState } from 'react';
import { Package } from 'lucide-react';
import { useSutra } from '@/lib/store';
import { GlassPanel, SectionTitle, Modal } from '@/components/ui';
import { validateManifest, permissionSummary, type PluginManifest } from '@sutra/plugin-sdk';

const MARKET: Array<PluginManifest & { installed: boolean }> = [
  { id: 'pl-linear', name: 'Linear Bridge', version: '0.3.0', description: 'Sync tasks with a Linear team via API.', author: 'sutra-community', license: 'MIT', entry: 'index.ts', scopes: ['network', 'memory.write'], minSutra: '0.1.0', installed: false },
  { id: 'pl-notion', name: 'Notion Sync', version: '1.2.3', description: 'Sync selected project folders into Notion pages.', author: 'sutra-community', license: 'MIT', entry: 'index.ts', scopes: ['network', 'fs.read'], minSutra: '0.1.0', installed: false },
  { id: 'pl-prometheus', name: 'Prometheus Push', version: '0.8.0', description: 'Push Aetherion metrics to a Prometheus endpoint.', author: 'sutra', license: 'MIT', entry: 'main.ts', scopes: ['network'], minSutra: '0.1.0', installed: false },
  { id: 'pl-vault', name: 'Vault Secrets', version: '0.4.1', description: 'Read secrets from Vault at deploy time. Why we need the secrets scope: inject deploy credentials without storing them locally.', author: 'sutra', license: 'MIT', entry: 'main.ts', scopes: ['secrets', 'deploy'], minSutra: '0.1.0', installed: false },
];

export default function PluginsPage() {
  const { s, mutate } = useSutra();
  const [review, setReview] = useState<(typeof MARKET)[number] | null>(null);
  const [enabled, setEnabled] = useState<Record<string, boolean>>({});

  const installed = useMemo(
    () => s.skills.filter((k) => k.kind === 'plugin'),
    [s.skills],
  );

  const install = (m: (typeof MARKET)[number]) => {
    const errs = validateManifest(m);
    if (errs.length) {
      alert(`Manifest rejected:\n- ${errs.join('\n- ')}`);
      return;
    }
    mutate((st) => ({
      ...st,
      skills: [...st.skills, { id: m.id, name: m.name, kind: 'plugin', description: m.description, version: m.version, license: m.license, author: m.author, scopes: m.scopes, installed: true, builtin: false }],
    }));
    setEnabled((e) => ({ ...e, [m.id]: true }));
    setReview(null);
  };

  const uninstall = (id: string) =>
    mutate((st) => ({ ...st, skills: st.skills.filter((k) => k.id !== id) }));

  return (
    <div className="space-y-6">
      <SectionTitle
        overline="plugins"
        title="Extensibility with receipts."
        sub="Every plugin ships a manifest: id, version, entry, scopes. Aetherion validates it before install and shows exactly what it asks for. Disable or remove any time — scopes revoke instantly."
      />
      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <div className="font-mono text-[10px] tracking-widest mb-3" style={{ color: 'var(--ok)' }}>INSTALLED · {installed.length}</div>
          <div className="space-y-2">
            {installed.map((p) => (
              <GlassPanel key={p.id} className="p-4">
                <div className="flex items-center gap-2">
                  <Package size={14} style={{ color: 'var(--acc2)' }} />
                  <span className="font-medium text-sm">{p.name}</span>
                  <span className="chip !text-[9px] ml-auto">v{p.version}</span>
                </div>
                <div className="text-[11px] mt-1.5" style={{ color: 'var(--dim)' }}>{p.description}</div>
                <div className="mt-2 text-[10px] font-mono" style={{ color: 'var(--dim)' }}>
                  {permissionSummary({ id: p.id, name: p.name, version: p.version, description: p.description, author: p.author, license: p.license, entry: 'x', scopes: p.scopes, minSutra: '0.1.0' })}
                </div>
                <div className="mt-2 flex gap-2">
                  <button onClick={() => setEnabled((e) => ({ ...e, [p.id]: !e[p.id] }))} className="btn-ghost !py-1.5 !px-3 text-[10px]">
                    {enabled[p.id] === false ? 'enable' : 'disable'}
                  </button>
                  <button onClick={() => uninstall(p.id)} className="btn-ghost !py-1.5 !px-3 text-[10px]" style={{ color: 'var(--bad)' }}>
                    uninstall
                  </button>
                </div>
              </GlassPanel>
            ))}
            {!installed.length && <div className="text-xs" style={{ color: 'var(--dim)' }}>no plugins installed.</div>}
          </div>
        </div>
        <div>
          <div className="font-mono text-[10px] tracking-widest mb-3" style={{ color: 'var(--dim)' }}>MARKETPLACE · {MARKET.length}</div>
          <div className="space-y-2">
            {MARKET.map((m) => {
              const taken = s.skills.some((k) => k.id === m.id);
              return (
                <GlassPanel key={m.id} className="p-4">
                  <div className="flex items-center gap-2">
                    <Package size={14} style={{ color: taken ? 'var(--ok)' : 'var(--dim)' }} />
                    <span className="font-medium text-sm">{m.name}</span>
                    <span className="chip !text-[9px] ml-auto">v{m.version}</span>
                  </div>
                  <div className="text-[11px] mt-1.5" style={{ color: 'var(--dim)' }}>{m.description}</div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {m.scopes.map((sc) => (
                      <span key={sc} className="chip !text-[9px]" style={{ color: sc === 'secrets' ? 'var(--bad)' : 'var(--acc)' }}>{sc}</span>
                    ))}
                  </div>
                  <button onClick={() => setReview(m)} disabled={taken} className="btn-primary !py-1.5 !px-3 text-[10px] mt-2" style={{ opacity: taken ? 0.35 : 1 }}>
                    {taken ? 'installed' : 'review & install'}
                  </button>
                </GlassPanel>
              );
            })}
          </div>
        </div>
      </div>

      <Modal open={!!review} onClose={() => setReview(null)} title="Permission review">
        {review && (
          <div className="space-y-4">
            <div>
              <div className="font-medium">{review.name} v{review.version}</div>
              <div className="text-xs mt-1" style={{ color: 'var(--dim)' }}>
                by {review.author} · {review.license}
              </div>
            </div>
            <div>
              <div className="font-mono text-[10px] tracking-widest mb-2" style={{ color: 'var(--acc2)' }}>REQUESTED SCOPES</div>
              <div className="flex flex-wrap gap-2">
                {review.scopes.map((sc) => (
                  <span key={sc} className="chip" style={{ color: sc === 'secrets' ? 'var(--bad)' : 'var(--acc)' }}>{sc}</span>
                ))}
              </div>
            </div>
            <div className="glass-2 p-3 text-xs leading-relaxed" style={{ color: 'var(--dim)' }}>
              {permissionSummary(review)}. Scopes are enforced by the gateway on every call and appear in the audit log. Uninstalling revokes all scopes immediately.
            </div>
            <div className="flex gap-3">
              <button onClick={() => install(review)} className="btn-primary !py-2 text-xs">Grant & install</button>
              <button onClick={() => setReview(null)} className="btn-ghost !py-2 text-xs">Cancel</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
