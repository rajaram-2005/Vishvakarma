'use client';
// Lumen Plugins — the plugin store + MCP connections in one place.
// Every plugin declares its permissions and license before enabling.
// MCP servers register through the real embedded gateway (/api/mcp/servers).

import React, { useEffect, useMemo, useState } from 'react';
import { Activity, Network, Package, Plug, Plus, RefreshCw, Search, ShieldCheck, Trash2 } from 'lucide-react';
import { useSutra } from '@/lib/store';
import { GlassPanel } from '@/components/ui';
import { PLUGIN_CATALOG } from '@/lib/catalog-plugins';
import { loadOnboarding } from '@/lib/onboarding';
import { BRAND, PERSONAS } from '@/lib/brand';

interface McpServer { id: string; name?: string; url: string; health?: { state?: string }; tools?: number }

export default function PluginsPage() {
  const { s, mutate, act } = useSutra();
  const [tab, setTab] = useState<'plugins' | 'mcp'>('plugins');
  const [q, setQ] = useState('');
  const [enabled, setEnabled] = useState<Record<string, boolean>>({});
  const [mcpUrl, setMcpUrl] = useState('');
  const [mcpName, setMcpName] = useState('');
  const [servers, setServers] = useState<McpServer[]>([]);
  const [mcpBusy, setMcpBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [persona, setPersona] = useState<string | undefined>(undefined);
  useEffect(() => { setPersona(loadOnboarding().personas[0]); }, []);

  const loadMcp = async () => {
    try {
      const res = await fetch('/api/mcp/servers', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json();
      setServers((j.servers ?? []) as McpServer[]);
      setError(null);
    } catch (e) {
      setError(String((e as Error).message ?? e));
    }
  };

  useEffect(() => { if (tab === 'mcp') void loadMcp(); }, [tab]);

  const recommended = useMemo(() => {
    const p = PERSONAS.find((x) => x.id === persona);
    if (!p) return [];
    return PLUGIN_CATALOG.filter((c) => p.plugins.includes(c.id));
  }, [persona]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return PLUGIN_CATALOG.filter((p) => !query || p.name.toLowerCase().includes(query) || p.tags.some((t) => t.includes(query)));
  }, [q]);

  const togglePlugin = (id: string) => {
    setEnabled((e) => {
      const next = { ...e, [id]: !e[id] };
      return next;
    });
    act('plugins', `${enabled[id] ? 'disabled' : 'enabled'} plugin`, id, undefined);
  };

  const install = (id: string, name: string) => {
    const item = PLUGIN_CATALOG.find((c) => c.id === id);
    if (!item) return;
    if (s.skills.some((k) => k.id === id)) return;
    mutate((st) => ({ ...st, skills: [...st.skills, { id: item.id, name: item.name, kind: 'plugin' as const, description: item.description, version: item.version, license: item.license, scopes: item.scopes, author: item.author, installed: true, builtin: false }] }));
    act('plugins', `installed ${name}`, item.scopes.join(', '), undefined);
  };

  const registerMcp = async () => {
    if (!mcpUrl.trim()) return;
    setMcpBusy(true); setError(null);
    try {
      const res = await fetch('/api/mcp/servers', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: mcpName.trim() || undefined, url: mcpUrl.trim() }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      setMcpUrl(''); setMcpName('');
      await loadMcp();
    } catch (e) {
      setError(String((e as Error).message ?? e));
    } finally {
      setMcpBusy(false);
    }
  };

  const removeMcp = async (id: string) => {
    const res = await fetch(`/api/mcp/servers/${id}`, { method: 'DELETE' });
    if (!res.ok) { setError(`delete failed: HTTP ${res.status}`); return; }
    await loadMcp();
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="overline mb-2">plugins</div>
        <div className="display-1">Extend the studio<span className="text-grad">.</span></div>
        <div className="text-sm mt-2 max-w-2xl leading-relaxed" style={{ color: 'var(--dim)' }}>
          {PLUGIN_CATALOG.length}+ plugins and any MCP server. Every capability declares its permissions, publisher and license before you enable it — nothing gets unrestricted access by default.
        </div>
      </div>

      {error && (
        <div className="glass p-3 font-mono text-[11px]" style={{ color: 'var(--warn)', borderColor: 'color-mix(in srgb, var(--warn) 40%, var(--line))' }}>
          ⚠ {error}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button onClick={() => setTab('plugins')} className="chip hover:opacity-100 !py-2" style={{ color: tab === 'plugins' ? 'var(--acc2)' : 'var(--dim)', borderColor: tab === 'plugins' ? 'color-mix(in srgb, var(--acc2) 50%, var(--line))' : undefined }}>
          <Package size={12} /> Plugin Store · {PLUGIN_CATALOG.length}
        </button>
        <button onClick={() => setTab('mcp')} className="chip hover:opacity-100 !py-2" style={{ color: tab === 'mcp' ? 'var(--acc2)' : 'var(--dim)', borderColor: tab === 'mcp' ? 'color-mix(in srgb, var(--acc2) 50%, var(--line))' : undefined }}>
          <Plug size={12} /> MCP Servers · {servers.length}
        </button>
      </div>

      {tab === 'plugins' && (
        <>
          {persona && recommended.length > 0 && (
            <GlassPanel className="p-4">
              <div className="font-mono text-[10px] tracking-widest mb-2.5" style={{ color: 'var(--acc2)' }}>
                RECOMMENDED FOR {PERSONAS.find((p) => p.id === persona)?.label.toUpperCase()}
              </div>
              <div className="flex flex-wrap gap-2">
                {recommended.map((p) => (
                  <span key={p.id} className="chip !text-[10px]" style={{ color: 'var(--dim)' }}>{p.name}</span>
                ))}
              </div>
            </GlassPanel>
          )}
          <div className="pill-input">
            <Search size={14} style={{ color: 'var(--dim)' }} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`search ${PLUGIN_CATALOG.length}+ plugins (linear, monitoring, security, media…)`} />
          </div>
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
            {filtered.slice(0, 60).map((p) => {
              const on = enabled[p.id] === true;
              const installed = s.skills.some((k) => k.id === p.id);
              return (
                <div key={p.id} className="glass-2 rounded-xl p-3.5 flex flex-col" style={{ borderColor: on ? 'color-mix(in srgb, var(--ok) 40%, var(--line))' : 'var(--line)' }}>
                  <div className="flex items-center gap-2">
                    <span className="grid place-items-center w-7 h-7 rounded-lg shrink-0" style={{ background: 'color-mix(in srgb, var(--acc) 20%, transparent)', color: 'var(--acc2)' }}>
                      <Package size={12} />
                    </span>
                    <div className="min-w-0">
                      <div className="text-[12px] font-semibold truncate" style={{ color: 'var(--ink)' }}>{p.name}</div>
                      <div className="text-[9px] font-mono truncate" style={{ color: 'var(--dim)' }}>v{p.version} · {p.author} · {p.license}</div>
                    </div>
                  </div>
                  <div className="text-[10px] mt-2 leading-relaxed flex-1" style={{ color: 'var(--dim)' }}>{p.description.slice(0, 110)}</div>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {p.scopes.length === 0 ? (
                      <span className="chip !text-[8px]" style={{ color: 'var(--ok)' }}>no permissions</span>
                    ) : p.scopes.map((sc) => (
                      <span key={sc} className="chip !text-[8px]" style={{ color: sc === 'network' || sc === 'terminal' || sc === 'db' ? 'var(--warn)' : 'var(--dim)' }}>{sc}</span>
                    ))}
                  </div>
                  <div className="flex gap-1.5 mt-2.5">
                    {!installed ? (
                      <button onClick={() => install(p.id, p.name)} className="btn-primary !py-1.5 !px-3 text-[10px]">
                        <Plus size={10} /> install
                      </button>
                    ) : (
                      <button onClick={() => togglePlugin(p.id)} className="btn-ghost !py-1.5 !px-3 text-[10px]" style={{ color: on ? 'var(--ok)' : 'var(--dim)' }}>
                        {on ? '● enabled' : '○ disabled'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-2 text-[10px] font-mono" style={{ color: 'var(--dim)' }}>
            <ShieldCheck size={11} /> permissions are declarative and audited · remote-only plugins run only when you are online
          </div>
        </>
      )}

      {tab === 'mcp' && (
        <div className="grid lg:grid-cols-2 gap-5">
          <GlassPanel className="p-5 space-y-3">
            <div className="font-mono text-[10px] tracking-widest" style={{ color: 'var(--acc2)' }}>CONNECT AN MCP SERVER</div>
            <input value={mcpName} onChange={(e) => setMcpName(e.target.value)} placeholder="name (optional)" className="glass-2 w-full px-3 py-2.5 text-xs outline-none" style={{ color: 'var(--ink)' }} />
            <div className="pill-input">
              <Network size={13} style={{ color: 'var(--dim)' }} />
              <input value={mcpUrl} onChange={(e) => setMcpUrl(e.target.value)} placeholder="https:// or ws:// endpoint…" className="font-mono text-xs" />
              <button onClick={() => void registerMcp()} disabled={mcpBusy || !mcpUrl.trim()} className="btn-primary !px-3 !py-2" style={{ opacity: mcpBusy || !mcpUrl.trim() ? 0.5 : 1 }}>
                {mcpBusy ? <RefreshCw size={12} className="animate-spin" /> : <Plus size={12} />}
              </button>
            </div>
            <div className="text-[9px] font-mono leading-relaxed" style={{ color: 'var(--dim)' }}>
              registration probes the server for health and capabilities · every server shows its permissions, publisher and trust info before tools are callable
            </div>
          </GlassPanel>
          <GlassPanel className="p-5">
            <div className="font-mono text-[10px] tracking-widest mb-3" style={{ color: 'var(--acc2)' }}>CONNECTED SERVERS · {servers.length}</div>
            {servers.length === 0 ? (
              <div className="text-xs" style={{ color: 'var(--dim)' }}>No MCP servers connected yet.</div>
            ) : (
              <div className="space-y-2">
                {servers.map((srv) => (
                  <div key={srv.id} className="glass-2 rounded-xl p-3 flex items-center gap-3">
                    <span className="grid place-items-center w-7 h-7 rounded-lg" style={{ background: 'color-mix(in srgb, var(--acc2) 18%, transparent)', color: 'var(--acc2)' }}>
                      <Plug size={12} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[12px] font-semibold truncate" style={{ color: 'var(--ink)' }}>{srv.name ?? srv.url}</div>
                      <div className="text-[9px] font-mono truncate" style={{ color: 'var(--dim)' }}>{srv.url}</div>
                    </div>
                    <span className="chip !text-[8px]" style={{ color: srv.health?.state === 'healthy' ? 'var(--ok)' : 'var(--warn)' }}>{srv.health?.state ?? 'unknown'}</span>
                    <span className="chip !text-[8px]" style={{ color: 'var(--dim)' }}>{srv.tools ?? 0} tools</span>
                    <button onClick={() => void removeMcp(srv.id)} className="p-1.5 rounded-lg" style={{ color: 'var(--dim)' }}>
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </GlassPanel>
        </div>
      )}
    </div>
  );
}
