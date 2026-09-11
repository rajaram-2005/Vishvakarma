'use client';
// Lumen — Memory: the WHAT. Local, searchable, deletable.

import React, { useMemo, useState } from 'react';
import { Brain, Plus, Trash2 } from 'lucide-react';
import { useSutra } from '@/lib/store';
import { GlassPanel, SectionTitle, SearchBox } from '@/components/ui';
import { cosine, embed, uid, timeAgo } from '@sutra/shared';
import type { MemoryEntry } from '@sutra/shared';

export default function MemoryPage() {
  const { s, mutate, act } = useSutra();
  const [text, setText] = useState('');
  const [kind, setKind] = useState<MemoryEntry['kind']>('fact');
  const [q, setQ] = useState('');

  const scored = useMemo(() => {
    if (!q.trim()) return s.memory.map((m) => ({ m, score: 0 }));
    const qv = embed(q);
    return s.memory.map((m) => ({ m, score: cosine(qv, embed(m.text)) }));
  }, [s.memory, q]);

  const list = q.trim() ? scored.sort((a, b) => b.score - a.score).slice(0, 12) : scored;

  const add = () => {
    if (!text.trim()) return;
    const entry: MemoryEntry = { id: uid('mem'), kind, text: text.trim(), source: 'manual', ts: new Date().toISOString() };
    mutate((st) => ({ ...st, memory: [entry, ...st.memory] }));
    act('memory', `stored · ${kind}`, text.slice(0, 50));
    setText('');
  };

  const remove = (id: string) => mutate((st) => ({ ...st, memory: st.memory.filter((m) => m.id !== id) }));

  return (
    <div className="space-y-6">
      <SectionTitle
        overline="memory"
        title={
          <>
            Memory = <span className="text-grad-cyan">WHAT.</span>
          </>
        }
        sub="Facts, preferences and episodes about you and the project. Stored locally (or Puter KV), retrieved by similarity, always visible and deletable."
      />
      <GlassPanel className="p-5">
        <div className="flex flex-col md:flex-row gap-3">
          <select value={kind} onChange={(e) => setKind(e.target.value as MemoryEntry['kind'])} className="glass-2 px-3 py-2 text-sm outline-none" style={{ color: 'var(--ink)' }}>
            <option value="fact">fact</option>
            <option value="preference">preference</option>
            <option value="episodic">episodic</option>
          </select>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
            placeholder="store a memory — e.g. “I prefer pnpm over npm”"
            className="glass-2 flex-1 px-4 py-2.5 text-sm outline-none"
            style={{ color: 'var(--ink)' }}
          />
          <button onClick={add} className="btn-primary !py-2" style={{ opacity: text.trim() ? 1 : 0.4 }}>
            <Plus size={13} /> Store
          </button>
        </div>
        <div className="mt-2 font-mono text-[9px]" style={{ color: 'var(--dim)' }}>
          tip: in Chat, say “remember that …” and it lands here automatically
        </div>
      </GlassPanel>
      <SearchBox value={q} onChange={setQ} placeholder="search memories (semantic + text)…" />
      <div className="space-y-2">
        {list.map(({ m, score }) => (
          <div key={m.id} className="glass-2 p-4 flex items-start gap-3">
            <Brain size={15} className="mt-0.5 shrink-0" style={{ color: 'var(--acc2)' }} />
            <div className="min-w-0 flex-1">
              <div className="text-sm">{m.text}</div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <span className="chip !text-[9px]" style={{ color: 'var(--acc)' }}>{m.kind}</span>
                <span className="chip !text-[9px]">{m.source}</span>
                <span className="chip !text-[9px]">{timeAgo(m.ts)}</span>
                {q.trim() && <span className="chip !text-[9px]" style={{ color: 'var(--acc2)' }}>sim {score.toFixed(2)}</span>}
              </div>
            </div>
            <button onClick={() => remove(m.id)} className="p-1.5" style={{ color: 'var(--dim)' }} title="delete">
              <Trash2 size={13} />
            </button>
          </div>
        ))}
        {!list.length && <div className="glass p-8 text-center text-sm" style={{ color: 'var(--dim)' }}>no memories yet.</div>}
      </div>
    </div>
  );
}
