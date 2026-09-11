'use client';
// Aetherion — Chat. Modern: aura header, gradient/glass bubbles, the
// own-model family front and centre, router reasoning on every answer.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Bot, Brain, Calculator, Code2, LineChart, Plus, SendHorizonal, Sparkles, Wrench } from 'lucide-react';
import { useSutra } from '@/lib/store';
import { sendChat, ownModelInfos } from '@/lib/chat';
import { reachableModels } from '@/lib/providers';
import { serverUsable } from '@/lib/server';
import { uid, timeAgo } from '@sutra/shared';
import type { ModelInfo } from '@sutra/shared';
import { usePuterAi } from '@/lib/puter';
import { OWN_MODELS } from '@/lib/localmodels/registry';

const OWN_ICONS: Record<string, React.ComponentType<{ size?: number | string }>> = {
  'aetherion-local': Bot,
  'aetherion-math': Calculator,
  'aetherion-coder': Code2,
  'aetherion-summarizer': Sparkles,
  'aetherion-analyst': LineChart,
  'aetherion-writer': Sparkles,
};

const SUGGESTIONS = [
  { icon: Sparkles, title: 'Meet the own models', text: 'What can you do?' },
  { icon: Calculator, title: 'Aetherion Math', text: 'What is 17 × 23 + 5?' },
  { icon: Code2, title: 'Aetherion Coder', text: 'Explain: function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); } }' },
  { icon: Brain, title: 'Aetherion Writer', text: 'Write a story about a lonely space station' },
];

export default function ChatPage() {
  const { s, mutate, trace, act } = useSutra();
  const puterAi = usePuterAi();
  const [convId, setConvId] = useState(s.conversations[0]?.id ?? '');
  const [input, setInput] = useState('');
  const [pin, setPin] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  const conv = s.conversations.find((c) => c.id === convId);

  useEffect(() => {
    if (puterAi.available && !puterAi.models) void puterAi.loadModels();
  }, [puterAi.available, puterAi.models, puterAi.loadModels]);

  const allModels = useMemo(() => {
    const puterModels: ModelInfo[] = (puterAi.models ?? []).map((m) => ({
      id: m.id,
      name: `${m.name} (Puter)`,
      provider: m.provider,
      runtime: 'puter-cloud',
      contextWindow: m.contextWindow ?? 128000,
      costIn: m.costPerMInput ?? 0,
      costOut: m.costPerMOutput ?? 0,
      latencyTier: 'medium',
      capabilities: ['code', 'math', 'long-context', 'creative', 'structured'],
      available: true,
      local: false,
    }));
    // Own-model family first — they are the product's own models.
    return [...ownModelInfos(), ...s.models, ...puterModels];
  }, [s.models, puterAi.models]);

  const pool = useMemo(() => reachableModels(allModels, s.settings), [allModels, s.settings]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [conv?.messages.length, streamText]);

  const newConv = () => {
    const id = uid('conv');
    mutate((st) => ({
      ...st,
      conversations: [
        { id, title: 'New conversation', createdAt: new Date().toISOString(), messages: [] },
        ...st.conversations,
      ],
    }));
    setConvId(id);
  };

  const send = async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || streaming) return;
    setInput('');
    let cid = convId;
    if (!cid || !s.conversations.some((c) => c.id === cid)) {
      cid = uid('conv');
      mutate((st) => ({
        ...st,
        conversations: [{ id: cid, title: content.slice(0, 42), createdAt: new Date().toISOString(), messages: [] }, ...st.conversations],
      }));
      setConvId(cid);
    }
    const userMsg = { id: uid('m'), role: 'user' as const, content, ts: new Date().toISOString() };
    mutate((st) => ({
      ...st,
      conversations: st.conversations.map((c) =>
        c.id === cid ? { ...c, title: c.messages.length === 0 ? content.slice(0, 42) : c.title, messages: [...c.messages, userMsg] } : c,
      ),
    }));

    const tr = trace('chat.request');
    tr.span('request.receive', 4, { chars: String(content.length) });
    setStreaming(true);
    setStreamText('');

    const history = [...(s.conversations.find((c) => c.id === cid)?.messages ?? []), userMsg];
    const result = await sendChat({
      text: content,
      models: allModels,
      settings: s.settings,
      forceModel: pin || undefined,
      history,
      trace: tr,
    });
    const live = tr.id;
    setStreaming(false);
    const asstMsg = {
      id: uid('m'),
      role: 'assistant' as const,
      content: result.content,
      ts: new Date().toISOString(),
      model: result.modelName,
      route: result.route,
    };
    mutate((st) => {
      let ns = {
        ...st,
        conversations: st.conversations.map((c) => (c.id === cid ? { ...c, messages: [...c.messages, asstMsg] } : c)),
      };
      if (result.memory) ns = { ...ns, memory: [result.memory!, ...ns.memory] };
      return ns;
    });
    act('chat', `chat · ${result.modelName}`, `routed: ${result.route.analysis} · ${result.content.length} chars`, live);
  };

  const pinnedName = pool.find((m) => m.id === pin)?.name ?? null;

  return (
    <div className="grid lg:grid-cols-[250px_1fr] gap-5">
      {/* ── Sidebar ─────────────────────────────────────────────── */}
      <div className="space-y-4">
        <div>
          <div className="overline mb-2">chat</div>
          <div className="display-2">Talk to the system.</div>
        </div>
        <div className="glass p-3">
          <button onClick={newConv} className="btn-primary w-full justify-center !py-2 text-xs">
            <Plus size={13} /> New conversation
          </button>
          <div className="mt-3 space-y-1 max-h-[240px] overflow-y-auto">
            {s.conversations.map((c) => (
              <button
                key={c.id}
                onClick={() => setConvId(c.id)}
                className="w-full text-left px-3 py-2 rounded-xl text-xs transition-all"
                style={{
                  background: c.id === convId ? 'color-mix(in srgb, var(--acc) 14%, transparent)' : 'transparent',
                  color: c.id === convId ? 'var(--ink)' : 'var(--dim)',
                }}
              >
                <div className="truncate font-medium">{c.title}</div>
                <div className="font-mono text-[9px] mt-0.5 opacity-70">{timeAgo(c.createdAt)}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Own-model family — always available, zero network */}
        <div className="glass p-3">
          <div className="font-mono text-[9px] tracking-widest mb-2 flex items-center justify-between">
            <span style={{ color: 'var(--dim)' }}>OWN MODELS · {OWN_MODELS.length}</span>
            <span className="dot-online" />
          </div>
          <div className="space-y-1.5">
            {OWN_MODELS.map((m) => {
              const Icon = OWN_ICONS[m.id] ?? Wrench;
              const active = pin === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => setPin(active ? '' : m.id)}
                  className="model-card w-full !p-2.5 !flex-row items-center gap-2.5"
                  style={active ? { borderColor: 'color-mix(in srgb, var(--acc) 70%, var(--line))', background: 'color-mix(in srgb, var(--acc) 12%, var(--panel))' } : undefined}
                >
                  <span className="grid place-items-center w-7 h-7 rounded-lg shrink-0" style={{ background: 'color-mix(in srgb, var(--acc) 22%, transparent)', color: 'var(--acc2)' }}>
                    <Icon size={13} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[11px] font-semibold truncate" style={{ color: 'var(--ink)' }}>{m.name}</span>
                    <span className="block text-[9px] truncate opacity-70" style={{ color: 'var(--dim)' }}>{m.tagline}</span>
                  </span>
                </button>
              );
            })}
          </div>
          <div className="mt-2.5 text-[10px] leading-relaxed" style={{ color: 'var(--dim)' }}>
            Tap to pin. Deterministic, on-device — nothing leaves the machine.
          </div>
        </div>

        <div className="glass p-3">
          <div className="font-mono text-[9px] tracking-widest mb-2" style={{ color: 'var(--dim)' }}>PIN MODEL</div>
          <select
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            className="glass-2 w-full px-3 py-2 text-xs outline-none"
            style={{ color: 'var(--ink)' }}
          >
            <option value="">auto (router)</option>
            {pool.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
          <div className="mt-2 text-[10px] leading-relaxed" style={{ color: 'var(--dim)' }}>
            {pool.length} reachable models. The router analyzes every request and shows its reasoning on each answer.
          </div>
        </div>
      </div>

      {/* ── Conversation ─────────────────────────────────────────── */}
      <div className="glass relative flex flex-col min-h-[72vh] !rounded-[24px] overflow-hidden">
        <div className="aura-ring hidden sm:block" />
        {/* header */}
        <div className="relative flex items-center gap-3 px-5 py-4 border-b" style={{ borderColor: 'var(--line)' }}>
          <span className="grid place-items-center w-9 h-9 rounded-xl" style={{ background: 'linear-gradient(135deg, var(--acc), var(--acc4))', color: '#fff' }}>
            <Bot size={16} />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-display font-semibold tracking-wide text-sm" style={{ color: 'var(--ink)' }}>Aetherion</span>
              <span className="dot-online" />
            </div>
            <div className="text-[10px] font-mono truncate" style={{ color: 'var(--dim)' }}>
              {pinnedName ? `pinned → ${pinnedName}` : 'auto router · own models + connected providers'}
            </div>
          </div>
        </div>

        {/* messages */}
        <div className="relative flex-1 overflow-y-auto p-5 space-y-5">
          {conv?.messages.map((m) => (
            <motion.div key={m.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
              <div className={`max-w-[85%] ${m.role === 'user' ? 'msg-user' : 'msg-assistant'}`}>{m.content}</div>
              {m.role === 'assistant' && (
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <span className="chip !text-[9px]" style={{ color: 'var(--acc2)' }}>routed: {m.route?.chosenName ?? m.model}</span>
                  {m.route?.analysis && <span className="chip !text-[9px]">{m.route.analysis}</span>}
                  {m.route?.reasons.slice(0, 2).map((r) => (
                    <span key={r} className="chip !text-[9px]" style={{ color: 'var(--dim)' }}>{r}</span>
                  ))}
                </div>
              )}
            </motion.div>
          ))}
          {streaming && (
            <div className="flex items-start gap-2">
              <span className="msg-assistant flex items-center gap-1.5 !py-3">
                <span className="typing-dot" style={{ animationDelay: '0ms' }} />
                <span className="typing-dot" style={{ animationDelay: '160ms' }} />
                <span className="typing-dot" style={{ animationDelay: '320ms' }} />
              </span>
            </div>
          )}
          {!conv?.messages.length && !streaming && (
            <div className="h-full flex flex-col items-center justify-center text-center py-6">
              <div className="display-2 mb-1.5">Aetherion is online<span className="text-grad">.</span></div>
              <div className="text-sm mb-6 max-w-md" style={{ color: 'var(--dim)' }}>
                Six own models run right here — math, code, summaries, data, stories — zero keys, zero network. Connect Ollama or pin the Aetheris core for more.
              </div>
              <div className="grid sm:grid-cols-2 gap-2.5 w-full max-w-lg">
                {SUGGESTIONS.map((sg) => (
                  <button key={sg.title} onClick={() => void send(sg.text)} className="suggestion-card">
                    <span className="flex items-center gap-2 text-[11px] font-semibold" style={{ color: 'var(--acc2)' }}>
                      <sg.icon size={12} /> {sg.title}
                    </span>
                    <span className="text-[10px] truncate" style={{ color: 'var(--dim)' }}>{sg.text}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        {/* composer */}
        <div className="relative p-4 border-t" style={{ borderColor: 'var(--line)' }}>
          <div className="pill-input">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && void send()}
              placeholder="message Aetherion…"
              disabled={streaming}
            />
            <button
              onClick={() => void send()}
              disabled={streaming || !input.trim()}
              className="btn-primary !px-4 !py-2.5"
              style={{ opacity: streaming || !input.trim() ? 0.4 : 1 }}
            >
              <SendHorizonal size={15} />
            </button>
          </div>
          <div className="mt-2 flex items-center justify-between font-mono text-[9px] tracking-wider" style={{ color: 'var(--dim)' }}>
            <span>own models: {OWN_MODELS.length} on-device · every answer is traced</span>
            <span>
              core:{' '}
              <span style={{ color: serverUsable(s.settings) ? 'var(--acc2)' : 'var(--dim)' }}>
                {serverUsable(s.settings) ? 'Aetherion API' : 'local'}
              </span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
