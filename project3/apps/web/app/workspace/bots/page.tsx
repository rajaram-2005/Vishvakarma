'use client';
// Lumen Bots — create personal AI bots: persona, system instructions,
// preferred model, knowledge scope and visibility. Bots run in Chat and can
// be published to the marketplace (public/unlisted/private).

import React, { useEffect, useMemo, useState } from 'react';
import { Bot, Globe, Lock, Plus, Trash2 } from 'lucide-react';
import { GlassPanel } from '@/components/ui';
import { OWN_MODELS } from '@/lib/localmodels/registry';
import { useSutra } from '@/lib/store';
import { uid } from '@sutra/shared';
import { BRAND } from '@/lib/brand';

interface BotDef {
  id: string; name: string; description: string; emoji: string;
  systemPrompt: string; model: string; visibility: 'private' | 'unlisted' | 'public';
  createdAt: number;
}
const KEY = 'lumen:bots:v1';
function loadBots(): BotDef[] {
  if (typeof window === 'undefined') return [];
  try { const j = JSON.parse(localStorage.getItem(KEY) ?? '[]') as BotDef[]; return Array.isArray(j) ? j : []; } catch { return []; }
}
function saveBots(bots: BotDef[]) {
  if (typeof window !== 'undefined') localStorage.setItem(KEY, JSON.stringify(bots.slice(0, 100)));
}

const VISIBILITY = [
  { id: 'private', label: 'Private', icon: Lock, sub: 'only you' },
  { id: 'unlisted', label: 'Unlisted', icon: Lock, sub: 'anyone with the link' },
  { id: 'public', label: 'Public', icon: Globe, sub: 'listed in the marketplace' },
] as const;

export default function BotsPage() {
  const { act } = useSutra();
  const [bots, setBots] = useState<BotDef[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [emoji, setEmoji] = useState('🤖');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [model, setModel] = useState('aetherion-local');
  const [visibility, setVisibility] = useState<'private' | 'unlisted' | 'public'>('private');

  useEffect(() => { setBots(loadBots()); }, []);

  const create = () => {
    if (!name.trim()) return;
    const bot: BotDef = {
      id: uid('bot'), name: name.trim(), description: description.trim() || 'A custom bot.',
      emoji: emoji || '🤖', systemPrompt: systemPrompt.trim(), model, visibility, createdAt: Date.now(),
    };
    const next = [bot, ...bots];
    setBots(next); saveBots(next);
    setName(''); setDescription(''); setSystemPrompt('');
    act('bots', 'bot created', bot.name, undefined);
  };

  const remove = (id: string) => {
    const next = bots.filter((b) => b.id !== id);
    setBots(next); saveBots(next);
  };

  const recommended = useMemo(() => OWN_MODELS.slice(0, 4), []);

  return (
    <div className="space-y-6">
      <div>
        <div className="overline mb-2">bots</div>
        <div className="display-1">Your AIs, your rules<span className="text-grad">.</span></div>
        <div className="text-sm mt-2 max-w-2xl leading-relaxed" style={{ color: 'var(--dim)' }}>
          Build a bot in seconds — personality, instructions, preferred model, knowledge and visibility. Use it in Chat like any model, or publish it.
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr_360px] gap-5">
        <GlassPanel className="p-5">
          <div className="font-mono text-[10px] tracking-widest mb-4" style={{ color: 'var(--acc2)' }}>YOUR BOTS · {bots.length}</div>
          {bots.length === 0 ? (
            <div className="text-xs" style={{ color: 'var(--dim)' }}>No bots yet — create one on the right, then pick it from the Chat sidebar.</div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-3">
              {bots.map((b) => (
                <div key={b.id} className="glass-2 rounded-xl p-4">
                  <div className="flex items-center gap-2.5">
                    <span className="text-xl">{b.emoji}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-semibold truncate" style={{ color: 'var(--ink)' }}>{b.name}</div>
                      <div className="text-[10px] truncate" style={{ color: 'var(--dim)' }}>{b.description}</div>
                    </div>
                    <button onClick={() => remove(b.id)} className="p-1.5 rounded-lg" style={{ color: 'var(--dim)' }}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-2.5">
                    <span className="chip !text-[8px]" style={{ color: 'var(--acc2)' }}>{recommended.find((m) => m.id === b.model)?.name ?? b.model}</span>
                    <span className="chip !text-[8px]" style={{ color: b.visibility === 'public' ? 'var(--ok)' : 'var(--dim)' }}>{b.visibility}</span>
                  </div>
                  {b.systemPrompt && <div className="text-[10px] mt-2 leading-relaxed opacity-70" style={{ color: 'var(--dim)' }}>“{b.systemPrompt.slice(0, 90)}…”</div>}
                </div>
              ))}
            </div>
          )}
        </GlassPanel>

        <GlassPanel className="p-5 h-fit lg:sticky lg:top-16 space-y-3.5">
          <div className="font-mono text-[10px] tracking-widest" style={{ color: 'var(--acc2)' }}>CREATE BOT</div>
          <div className="flex gap-2">
            <input value={emoji} onChange={(e) => setEmoji(e.target.value.slice(0, 4))} className="glass-2 w-14 px-2 py-2.5 text-center text-lg outline-none" style={{ color: 'var(--ink)' }} />
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="bot name" className="glass-2 flex-1 px-3 py-2.5 text-sm outline-none" style={{ color: 'var(--ink)' }} />
          </div>
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="what does it do?" className="glass-2 w-full px-3 py-2.5 text-xs outline-none" style={{ color: 'var(--ink)' }} />
          <textarea value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} rows={4} placeholder="system instructions — persona, tone, output format, constraints…" className="glass-2 w-full px-3 py-2.5 text-sm outline-none resize-y" style={{ color: 'var(--ink)' }} />
          <div>
            <div className="text-[10px] font-mono tracking-widest mb-1.5" style={{ color: 'var(--dim)' }}>PREFERRED MODEL</div>
            <select value={model} onChange={(e) => setModel(e.target.value)} className="glass-2 w-full px-3 py-2.5 text-xs outline-none" style={{ color: 'var(--ink)' }}>
              <option value="">router decides</option>
              {recommended.map((m) => <option key={m.id} value={m.id}>{m.name} — on-device</option>)}
            </select>
          </div>
          <div>
            <div className="text-[10px] font-mono tracking-widest mb-1.5" style={{ color: 'var(--dim)' }}>VISIBILITY</div>
            <div className="flex gap-1.5">
              {VISIBILITY.map((v) => (
                <button key={v.id} onClick={() => setVisibility(v.id)} className="chip hover:opacity-100 !text-[9px]" style={{ color: visibility === v.id ? 'var(--acc2)' : 'var(--dim)', borderColor: visibility === v.id ? 'color-mix(in srgb, var(--acc2) 50%, var(--line))' : undefined }} title={v.sub}>
                  <v.icon size={9} /> {v.label}
                </button>
              ))}
            </div>
          </div>
          <button onClick={create} disabled={!name.trim()} className="btn-primary w-full justify-center disabled:opacity-50">
            <Plus size={14} /> create bot
          </button>
          <div className="text-[9px] font-mono leading-relaxed" style={{ color: 'var(--dim)' }}>
            publishing is local to your {BRAND.name} workspace — share your workspace to share your bots
          </div>
        </GlassPanel>
      </div>
    </div>
  );
}
