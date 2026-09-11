'use client';
// Aetherion — Marketplace: skills, plugins, workflows, MCP servers, model presets.

import React, { useMemo, useState } from 'react';
import { Store } from 'lucide-react';
import { useSutra } from '@/lib/store';
import { GlassPanel, SectionTitle, Modal, SearchBox } from '@/components/ui';
import { CATALOG, catalogItemToSkill, catalogItemToWorkflow, catalogItemToMcp } from '@/lib/catalog';

const KINDS = ['all', 'skill', 'plugin', 'workflow', 'mcp', 'model'] as const;

export default function MarketplacePage() {
  const { s, mutate, act } = useSutra();
  const [kind, setKind] = useState<(typeof KINDS)[number]>('all');
  const [q, setQ] = useState('');
  const [review, setReview] = useState<(typeof CATALOG)[number] | null>(null);
  const [toast, setToast] = useState('');

  const list = CATALOG.filter(
    (c) => (kind === 'all' || c.kind === kind) && (!q || `${c.name} ${c.description}`.toLowerCase().includes(q.toLowerCase())),
  );

  const isInstalled = useMemo(() => {
    const set = new Set<string>(s.installed);
    for (const c of CATALOG) {
      if (c.kind === 'skill' || c.kind === 'plugin') if (s.skills.some((k) => k.id === c.id)) set.add(c.id);
      if (c.kind === 'workflow') if (s.workflows.some((w) => w.id === c.id)) set.add(c.id);
      if (c.kind === 'mcp') if (s.mcp.some((m) => m.id === c.id)) set.add(c.id);
    }
    return set;
  }, [s]);

  const install = (c: (typeof CATALOG)[number]) => {
    mutate((st) => {
      let ns = { ...st, installed: [...st.installed, c.id] };
      if (c.kind === 'skill' || c.kind === 'plugin') {
        ns = { ...ns, skills: [...ns.skills, catalogItemToSkill(c)] };
      } else if (c.kind === 'workflow') {
        ns = { ...ns, workflows: [catalogItemToWorkflow(c), ...ns.workflows] };
      } else if (c.kind === 'mcp') {
        ns = { ...ns, mcp: [catalogItemToMcp(c), ...ns.mcp] };
      }
      return ns;
    });
    act('marketplace', `installed ${c.name}`, `kind: ${c.kind}`);
    setToast(`${c.name} installed → local registry`);
    setTimeout(() => setToast(''), 2500);
    setReview(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <SectionTitle
          overline="marketplace"
          title="Capability, on demand."
          sub="Every item declares its scopes before install. Installing is local: it lands in your registry, audited and revocable."
        />
        {toast && <span className="chip" style={{ color: 'var(--ok)' }}>{toast}</span>}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1.5">
          {KINDS.map((k) => (
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
          <SearchBox value={q} onChange={setQ} placeholder="search the catalog…" />
        </div>
      </div>

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
        {list.map((c) => {
          const taken = isInstalled.has(c.id);
          return (
            <GlassPanel key={c.id} className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Store size={13} style={{ color: 'var(--acc2)' }} />
                <span className="font-mono text-[9px] uppercase tracking-widest" style={{ color: 'var(--dim)' }}>{c.kind}</span>
                <span className="chip !text-[9px] ml-auto">v{c.version}</span>
              </div>
              <div className="font-medium text-sm">{c.name}</div>
              <div className="text-[11px] mt-1.5 leading-relaxed" style={{ color: 'var(--dim)' }}>{c.description}</div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {c.scopes.length ? (
                  c.scopes.map((sc) => (
                    <span key={sc} className="chip !text-[9px]" style={{ color: sc === 'secrets' ? 'var(--bad)' : 'var(--acc)' }}>{sc}</span>
                  ))
                ) : (
                  <span className="chip !text-[9px]">no scopes</span>
                )}
                <span className="chip !text-[9px]">{c.license}</span>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <button
                  onClick={() => (c.scopes.length ? setReview(c) : install(c))}
                  disabled={taken}
                  className={taken ? 'chip' : 'btn-primary !py-1.5 !px-3 text-[10px]'}
                  style={taken ? { color: 'var(--ok)' } : { opacity: taken ? 0.5 : 1 }}
                >
                  {taken ? '✓ installed' : c.scopes.length ? 'review scopes' : 'install'}
                </button>
                <span className="font-mono text-[9px] ml-auto" style={{ color: 'var(--dim)' }}>{c.author}</span>
              </div>
            </GlassPanel>
          );
        })}
      </div>

      <Modal open={!!review} onClose={() => setReview(null)} title="Scope review">
        {review && (
          <div className="space-y-4">
            <div>
              <div className="font-medium">{review.name} v{review.version}</div>
              <div className="text-xs mt-1" style={{ color: 'var(--dim)' }}>
                {review.author} · {review.license}
              </div>
            </div>
            <div>
              <div className="font-mono text-[10px] tracking-widest mb-2" style={{ color: 'var(--acc2)' }}>ASKS FOR</div>
              <div className="flex flex-wrap gap-2">
                {review.scopes.map((sc) => (
                  <span key={sc} className="chip" style={{ color: sc === 'secrets' ? 'var(--bad)' : 'var(--acc)' }}>{sc}</span>
                ))}
              </div>
            </div>
            <div className="glass-2 p-3 text-xs" style={{ color: 'var(--dim)' }}>
              Scopes are enforced at the gateway. Uninstalling from Skills/Plugins/Workflows/MCP revokes them instantly.
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
