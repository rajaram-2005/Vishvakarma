'use client';
// Aetherion — Chat. Request → Router → Model → Result, streamed and traced.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, SendHorizonal, Sparkles } from 'lucide-react';
import { useSutra } from '@/lib/store';
import { GlassPanel, SectionTitle } from '@/components/ui';
import { sendChat } from '@/lib/chat';
import { reachableModels } from '@/lib/providers';
import { serverUsable } from '@/lib/server';
import { uid, timeAgo } from '@sutra/shared';
import type { ModelInfo } from '@sutra/shared';
import { usePuterAi } from '@/lib/puter';

const SUGGESTIONS = [
  'Plan my Project 3 MVP.',
  'What are Aetherion’s design principles?',
  'What is 17 × 23 + 5?',
  'Remember that I prefer TypeScript and dark themes.',
  'Explain: function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); } }',
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

  // Puter gateway models join the pool once signed in (billed to the user's
  // own Puter account — no API keys). Loaded lazily, cached by the hook.
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
    return [...s.models, ...puterModels];
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

  return (
    <div className="grid lg:grid-cols-[240px_1fr] gap-5">
      <div className="space-y-4">
        <SectionTitle overline="chat" title="Talk to the system." />
        <GlassPanel className="p-3">
          <button onClick={newConv} className="btn-ghost w-full justify-center !py-2 text-xs">
            <Plus size={13} /> New conversation
          </button>
          <div className="mt-3 space-y-1 max-h-[300px] overflow-y-auto">
            {s.conversations.map((c) => (
              <button
                key={c.id}
                onClick={() => setConvId(c.id)}
                className="w-full text-left px-3 py-2 rounded-lg text-xs transition-colors"
                style={{
                  background: c.id === convId ? 'color-mix(in srgb, var(--acc) 14%, transparent)' : 'transparent',
                  color: c.id === convId ? 'var(--ink)' : 'var(--dim)',
                }}
              >
                <div className="truncate">{c.title}</div>
                <div className="font-mono text-[9px] mt-0.5">{timeAgo(c.createdAt)}</div>
              </button>
            ))}
          </div>
        </GlassPanel>
        <GlassPanel className="p-3">
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
            {pool.length} reachable models. The router analyzes each request and shows its reasoning on every answer.
          </div>
        </GlassPanel>
      </div>

      <GlassPanel className="flex flex-col !rounded-[22px] min-h-[70vh]">
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {conv?.messages.map((m) => (
            <motion.div key={m.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={`max-w-[85%] ${m.role === 'user' ? 'ml-auto' : ''}`}>
              <div
                className="glass-2 p-4 text-sm leading-relaxed whitespace-pre-wrap"
                style={m.role === 'user' ? { borderColor: 'color-mix(in srgb, var(--acc) 40%, var(--line))' } : undefined}
              >
                {m.content}
              </div>
              {m.route && (
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <span className="chip !text-[9px]" style={{ color: 'var(--acc2)' }}>
                    routed: {m.route.chosenName}
                  </span>
                  <span className="chip !text-[9px]">{m.route.analysis}</span>
                  {m.route.reasons.slice(0, 2).map((r) => (
                    <span key={r} className="chip !text-[9px]" style={{ color: 'var(--dim)' }}>{r}</span>
                  ))}
                </div>
              )}
              {m.model && m.role === 'assistant' && !m.route && (
                <div className="mt-1 font-mono text-[9px]" style={{ color: 'var(--dim)' }}>{m.model}</div>
              )}
            </motion.div>
          ))}
          {streaming && (
            <div className="max-w-[85%]">
              <div className="glass-2 p-4 text-sm leading-relaxed whitespace-pre-wrap">
                {streamText || <span style={{ color: 'var(--dim)' }}>…</span>}
              </div>
            </div>
          )}
          {!conv?.messages.length && !streaming && (
            <div className="h-full flex items-center justify-center">
              <div className="text-center max-w-sm">
                <Sparkles size={22} className="mx-auto mb-3" style={{ color: 'var(--acc2)' }} />
                <div className="text-sm mb-4" style={{ color: 'var(--dim)' }}>
                  Aetherion Local answers offline. Connect Ollama in Settings for real local models.
                </div>
                <div className="flex flex-col gap-2">
                  {SUGGESTIONS.map((sg) => (
                    <button key={sg} onClick={() => void send(sg)} className="chip hover:opacity-100 !text-[10px] self-center" style={{ opacity: 0.75 }}>
                      {sg}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>
        <div className="p-4 border-t" style={{ borderColor: 'var(--line)' }}>
          <div className="flex gap-3">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && void send()}
              placeholder="message Aetherion…  (try: remember that I prefer TypeScript)"
              className="glass-2 flex-1 px-4 py-3 text-sm outline-none"
              style={{ color: 'var(--ink)' }}
              disabled={streaming}
            />
            <button onClick={() => void send()} disabled={streaming || !input.trim()} className="btn-primary !px-5" style={{ opacity: streaming || !input.trim() ? 0.4 : 1 }}>
              <SendHorizonal size={15} />
            </button>
          </div>
          <div className="mt-2 font-mono text-[9px] tracking-wider" style={{ color: 'var(--dim)' }}>
            router: {s.settings.privacyMode === 'local' ? 'local-only pool' : 'all reachable'} · core:{' '}
            <span style={{ color: serverUsable(s.settings) ? 'var(--acc2)' : 'var(--dim)' }}>
              {serverUsable(s.settings) ? 'Aetherion API' : 'local'}
            </span>{' '}
            · every answer is traced · “remember X” stores to memory
          </div>
        </div>
      </GlassPanel>
    </div>
  );
}
