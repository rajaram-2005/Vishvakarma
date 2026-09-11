'use client';
// Lumen Library — one place for files, chats, projects, media, knowledge,
// memory, schedules, bots and models. Search crosses every subsystem.

import React, { useEffect, useMemo, useState } from 'react';
import {
  Bot, Calendar, Cpu, Database, FileCode2, FileText, Folder, Image as ImageIcon,
  MessageSquare, Search, Sparkles, X,
} from 'lucide-react';
import { GlassPanel } from '@/components/ui';
import { useSutra } from '@/lib/store';
import { loadOnboarding } from '@/lib/onboarding';
import { BRAND, PERSONAS } from '@/lib/brand';
import { OWN_MODELS } from '@/lib/localmodels/registry';

interface LibItem {
  id: string;
  kind: 'chat' | 'project' | 'media' | 'schedule' | 'kb' | 'memory' | 'bot' | 'model';
  title: string;
  sub: string;
  collection: string;
  updatedAt: number;
  icon: React.ComponentType<{ size?: number | string }>;
}

interface GalleryItem { id: string; title: string; prompt: string; createdAt: number }
interface ScheduleItem { id: string; name: string; human: string; updatedAt: number }
interface KbItem { id: string; name: string; updatedAt?: number; createdAt?: number }
interface MemItem { id: string; text: string; ts?: number; updatedAt?: number }

function useApi<T>(path: string): T[] {
  const [data, setData] = useState<T[]>([]);
  useEffect(() => {
    let on = true;
    fetch(path, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j) => { if (on) setData(Array.isArray(j) ? (j as T[]) : ([] as T[])); })
      .catch(() => {});
    return () => { on = false; };
  }, [path]);
  return data;
}

export default function LibraryPage() {
  const { s } = useSutra();
  const [personaIds, setPersonaIds] = useState<string[]>([]);
  useEffect(() => { setPersonaIds(loadOnboarding().personas); }, []);
  const [q, setQ] = useState('');
  const [collection, setCollection] = useState<string>('all');

  const gallery = useApi<GalleryItem>('/api/gallery');
  const schedules = useApi<ScheduleItem & { human?: string }>('/api/schedules');
  const kbs = useApi<KbItem & { name?: string }>('/api/kb');
  const memories = useApi<MemItem & { text?: string }>('/api/memory');

  // media + projects + bots from local storage (read after mount: hydration-safe)
  const [media, setMedia] = useState<Array<{ id: string; type: string; prompt: string; createdAt: number; mode: string }>>([]);
  const [projects, setProjects] = useState<Array<{ id: string; name: string; createdAt: string; request: string }>>([]);
  const [bots, setBots] = useState<Array<{ id: string; name: string; description: string; emoji: string; createdAt: number }>>([]);
  useEffect(() => {
    try { setMedia(JSON.parse(localStorage.getItem('lumen:media:v1') ?? '[]')); } catch { setMedia([]); }
    try { setProjects(JSON.parse(localStorage.getItem('lumen:coder:v1') ?? '[]')); } catch { setProjects([]); }
    try { setBots(JSON.parse(localStorage.getItem('lumen:bots:v1') ?? '[]')); } catch { setBots([]); }
  }, []);

  const items = useMemo<LibItem[]>(() => {
    const out: LibItem[] = [];
    for (const c of s.conversations) out.push({ id: c.id, kind: 'chat', title: c.title, sub: `${c.messages.length} messages`, collection: 'Chats', updatedAt: Date.parse(c.createdAt ?? '') || 0, icon: MessageSquare });
    for (const p of projects) out.push({ id: p.id, kind: 'project', title: p.name, sub: p.request.slice(0, 60), collection: 'Projects', updatedAt: Date.parse(p.createdAt ?? '') || 0, icon: FileCode2 });
    for (const m of media) out.push({ id: m.id, kind: 'media', title: m.prompt.slice(0, 60), sub: `${m.mode} · ${m.type}`, collection: 'Media', updatedAt: m.createdAt || 0, icon: ImageIcon });
    for (const sched of schedules) out.push({ id: sched.id, kind: 'schedule', title: sched.name, sub: sched.human ?? 'schedule', collection: 'Schedules', updatedAt: sched.updatedAt || 0, icon: Calendar });
    for (const kb of kbs) out.push({ id: kb.id, kind: 'kb', title: kb.name, sub: 'knowledge base', collection: 'Knowledge', updatedAt: kb.updatedAt || kb.createdAt || 0, icon: Database });
    for (const m of memories) out.push({ id: m.id, kind: 'memory', title: (m.text ?? '').slice(0, 70), sub: 'memory', collection: 'Memory', updatedAt: m.updatedAt || m.ts || 0, icon: Sparkles });
    for (const b of bots) out.push({ id: b.id, kind: 'bot', title: b.name, sub: b.description, collection: 'Bots', updatedAt: b.createdAt || 0, icon: Bot });
    for (const m of OWN_MODELS) out.push({ id: m.id, kind: 'model', title: m.name, sub: m.tagline, collection: 'Models', updatedAt: 0, icon: Cpu });
    return out.sort((a, b) => b.updatedAt - a.updatedAt);
  }, [s.conversations, projects, media, schedules, kbs, memories, bots]);

  const collections = useMemo(() => {
    const builtIn = ['all', 'Chats', 'Projects', 'Media', 'Schedules', 'Knowledge', 'Memory', 'Bots', 'Models'];
    const persona = (PERSONAS.find((p) => p.id === personaIds[0])?.collections ?? []);
    return [...new Set([...builtIn, ...persona])];
  }, [personaIds]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return items.filter((i) =>
      (collection === 'all' || i.collection === collection) &&
      (!query || i.title.toLowerCase().includes(query) || i.sub.toLowerCase().includes(query)),
    );
  }, [items, q, collection]);

  return (
    <div className="space-y-6">
      <div>
        <div className="overline mb-2">library</div>
        <div className="display-1">Everything you make, in one place<span className="text-grad">.</span></div>
        <div className="text-sm mt-2 max-w-2xl leading-relaxed" style={{ color: 'var(--dim)' }}>
          Chats, projects, media, knowledge, memory, schedules, bots and models — searchable together, organized into collections, available to Chat as context when you allow it.
        </div>
      </div>

      <div className="pill-input">
        <Search size={14} style={{ color: 'var(--dim)' }} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`search across ${items.length} library items…`} />
        {q && <button onClick={() => setQ('')} className="p-1" style={{ color: 'var(--dim)' }}><X size={13} /></button>}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {collections.map((c) => (
          <button key={c} onClick={() => setCollection(c)} className="chip hover:opacity-100 !text-[10px]" style={{ color: collection === c ? 'var(--acc2)' : 'var(--dim)', borderColor: collection === c ? 'color-mix(in srgb, var(--acc2) 50%, var(--line))' : undefined }}>
            {c === 'all' ? `all · ${items.length}` : c}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <GlassPanel className="p-8 text-center">
          <Folder size={24} style={{ color: 'var(--dim)', margin: '0 auto 8px' }} />
          <div className="text-sm" style={{ color: 'var(--dim)' }}>
            {q ? `nothing matches “${q}”` : 'Nothing here yet — chat, build, create or schedule something and it will appear in the Library.'}
          </div>
        </GlassPanel>
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
          {filtered.slice(0, 60).map((item) => (
            <a
              key={item.id}
              href={item.kind === 'chat' ? '/workspace/chat' : item.kind === 'project' ? '/workspace/coder' : item.kind === 'schedule' ? '/workspace/schedule' : item.kind === 'bot' ? '/workspace/bots' : item.kind === 'model' ? '/workspace/models' : '/workspace/library'}
              className="glass-2 rounded-xl p-3.5 transition-all hover:translate-y-[-1px]"
              style={{ display: 'block' }}
            >
              <div className="flex items-center gap-2">
                <span className="grid place-items-center w-7 h-7 rounded-lg shrink-0" style={{ background: 'color-mix(in srgb, var(--acc) 20%, transparent)', color: 'var(--acc2)' }}>
                  <item.icon size={13} />
                </span>
                <span className="text-[12px] font-semibold truncate" style={{ color: 'var(--ink)' }}>{item.title}</span>
                <span className="chip !text-[8px] ml-auto shrink-0" style={{ color: 'var(--dim)' }}>{item.collection}</span>
              </div>
              <div className="text-[10px] mt-1.5 truncate" style={{ color: 'var(--dim)' }}>{item.sub}</div>
            </a>
          ))}
        </div>
      )}

      <div className="text-[10px] font-mono" style={{ color: 'var(--dim)' }}>
        {BRAND.name} Library · chat, studio, coder and schedule output lands here automatically · knowledge bases are used for RAG with your permission
      </div>
    </div>
  );
}
