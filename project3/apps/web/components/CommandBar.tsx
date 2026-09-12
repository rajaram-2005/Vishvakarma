'use client';
// Lumen Studio — universal command bar (Cmd/Ctrl+K). One search across
// actions, models, plugins and library content.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Bot, Calendar, Command, Cpu, FileCode2, FolderKanban, Image as ImageIcon,
  Library, Package, Plug, Search, Sparkles, Wrench,
} from 'lucide-react';
import { useSutra } from '@/lib/store';
import { OWN_MODELS } from '@/lib/localmodels/registry';
import { PLUGIN_CATALOG } from '@/lib/catalog-plugins';
import { BRAND } from '@/lib/brand';

interface CmdItem {
  id: string;
  label: string;
  hint?: string;
  icon: React.ComponentType<{ size?: number | string; style?: React.CSSProperties }>;
  run: () => void;
}

export function CommandBar() {
  const router = useRouter();
  const { s } = useSutra();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (open) {
      setQ('');
      setSel(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  const actions = useMemo<CmdItem[]>(() => {
    const go = (p: string) => () => {
      setOpen(false);
      router.push(p);
    };
    const models: CmdItem[] = [
      ...OWN_MODELS.map((m) => ({ id: `model:${m.id}`, label: m.name, hint: 'own model · offline', icon: Sparkles, run: go('/workspace/chat') })),
      ...s.models.map((m) => ({ id: `model:${m.id}`, label: m.name, hint: m.runtime, icon: Cpu, run: go('/workspace/chat') })),
    ];
    const plugins: CmdItem[] = PLUGIN_CATALOG.slice(0, 40).map((p) => ({
      id: `plugin:${p.id}`, label: p.name, hint: `plugin · ${p.tags.slice(0, 2).join(' · ')}`, icon: Plug, run: go('/workspace/plugins'),
    }));
    const library: CmdItem[] = [
      ...s.conversations.map((c) => ({ id: `chat:${c.id}`, label: c.title, hint: 'chat', icon: Bot, run: go('/workspace/chat') })),
      ...s.projects.map((p) => ({ id: `proj:${p.id}`, label: p.name, hint: 'project', icon: FolderKanban, run: go('/workspace/coder') })),
    ];
    return [
      { id: 'new-chat', label: 'New Chat', hint: 'start a conversation', icon: Bot, run: go('/workspace/chat') },
      { id: 'create-bot', label: 'Create Bot', hint: 'build a custom bot', icon: Bot, run: go('/workspace/bots') },
      { id: 'create-model', label: 'Create Model', hint: 'connect your own model', icon: Cpu, run: go('/workspace/models') },
      { id: 'open-studio', label: 'Open Studio', hint: 'images · video · audio · documents', icon: ImageIcon, run: go('/workspace/studio') },
      { id: 'open-coder', label: 'Open Coder', hint: 'build and ship', icon: FileCode2, run: go('/workspace/coder') },
      { id: 'open-library', label: 'Open Library', hint: 'files, assets, knowledge', icon: Library, run: go('/workspace/library') },
      { id: 'create-schedule', label: 'Create Schedule', hint: 'automate recurring work', icon: Calendar, run: go('/workspace/schedule') },
      { id: 'install-plugin', label: 'Install Plugin', hint: 'browse the plugin store', icon: Package, run: go('/workspace/plugins') },
      { id: 'add-mcp', label: 'Add MCP Server', hint: 'connect external tools', icon: Plug, run: go('/workspace/plugins') },
      { id: 'create-image', label: 'Create Image', hint: 'image studio', icon: ImageIcon, run: go('/workspace/studio') },
      { id: 'create-document', label: 'Create Document', hint: 'document studio', icon: Wrench, run: go('/workspace/studio') },
      ...models,
      ...plugins,
      ...library,
    ];
  }, [router, s.models, s.conversations, s.projects]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return actions.slice(0, 12);
    return actions.filter((a) => a.label.toLowerCase().includes(query) || (a.hint ?? '').toLowerCase().includes(query)).slice(0, 16);
  }, [actions, q]);

  useEffect(() => {
    setSel(0);
  }, [q]);

  if (!open) return null;

  const run = (item: CmdItem) => {
    setOpen(false);
    item.run();
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[14vh]"
      style={{ background: 'rgba(2,3,8,.55)', backdropFilter: 'blur(8px)' }}
      onMouseDown={() => setOpen(false)}
    >
      <div
        className="glass-2 w-full max-w-xl rounded-2xl p-2"
        style={{ boxShadow: '0 40px 120px -30px rgba(0,0,0,.85), 0 0 0 1px color-mix(in srgb, var(--acc) 30%, var(--line))' }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="pill-input !py-0 mb-1.5">
          <Command size={14} style={{ color: 'var(--acc2)' }} />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setSel((v) => Math.min(v + 1, filtered.length - 1)); }
              if (e.key === 'ArrowUp') { e.preventDefault(); setSel((v) => Math.max(v - 1, 0)); }
              if (e.key === 'Enter' && filtered[sel]) run(filtered[sel]);
            }}
            placeholder={`search ${BRAND.name} — models, plugins, chats, actions…`}
          />
        </div>
        <div className="max-h-[340px] overflow-y-auto">
          {filtered.map((item, i) => (
            <button
              key={item.id}
              onClick={() => run(item)}
              onMouseEnter={() => setSel(i)}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-left transition-colors"
              style={{ background: i === sel ? 'color-mix(in srgb, var(--acc) 16%, transparent)' : 'transparent', color: 'var(--ink)' }}
            >
              <item.icon size={14} style={{ color: i === sel ? 'var(--acc2)' : 'var(--dim)' }} />
              <span className="truncate">{item.label}</span>
              {item.hint && <span className="ml-auto font-mono text-[9px] shrink-0" style={{ color: 'var(--dim)' }}>{item.hint}</span>}
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="px-3 py-6 text-center text-xs" style={{ color: 'var(--dim)' }}>
              nothing found for “{q}”
            </div>
          )}
        </div>
        <div className="px-3 pt-1.5 pb-1 font-mono text-[9px] flex items-center gap-2" style={{ color: 'var(--dim)' }}>
          <Search size={10} /> type to search · ↑↓ navigate · ↵ open · esc close
        </div>
      </div>
    </div>
  );
}
