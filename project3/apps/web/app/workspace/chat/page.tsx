'use client';
// Aetherion — Chat. ChatGPT-inspired surface + Claude-style artifacts:
// conversation search, a model-picker pill above the composer, gradient
// bubbles, code blocks rendered as Artifact cards (copy · language · lines)
// and per-message actions.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Bot, Brain, Calculator, Check, ChevronDown, Code2, Copy, LineChart, Plus,
  Search, SendHorizonal, Sparkles, Wrench, X,
} from 'lucide-react';
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

// ── Claude-style artifact renderer ────────────────────────────────────────────
type Part = { type: 'text'; text: string } | { type: 'code'; lang: string; code: string };

function splitParts(content: string): Part[] {
  const parts: Part[] = [];
  const re = /```([a-z0-9_+-]*)\n([\s\S]*?)```/gi;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    if (m.index > last) parts.push({ type: 'text', text: content.slice(last, m.index) });
    parts.push({ type: 'code', lang: m[1] || 'code', code: m[2].replace(/\n$/, '') });
    last = m.index + m[0].length;
  }
  if (last < content.length) parts.push({ type: 'text', text: content.slice(last) });
  return parts;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };
  return (
    <button onClick={() => void copy()} className="chip !text-[9px] hover:opacity-100" style={{ color: 'var(--acc2)', cursor: 'pointer' }}>
      {copied ? <Check size={10} /> : <Copy size={10} />} {copied ? 'copied' : 'copy'}
    </button>
  );
}

function ArtifactCard({ lang, code }: { lang: string; code: string }) {
  const lines = code.split('\n').length;
  return (
    <div className="glass-2 rounded-xl overflow-hidden border" style={{ borderColor: 'var(--line)' }}>
      <div className="flex items-center gap-2 px-3 py-2 border-b" style={{ borderColor: 'var(--line)', background: 'color-mix(in srgb, var(--panel-2) 60%, transparent)' }}>
        <span className="chip !text-[8px]" style={{ color: 'var(--acc3)' }}>{lang || 'code'}</span>
        <span className="text-[9px] font-mono" style={{ color: 'var(--dim)' }}>{lines} line{lines === 1 ? '' : 's'}</span>
        <span className="chip !text-[8px]" style={{ color: 'var(--dim)' }}>artifact</span>
        <div className="ml-auto">
          <CopyButton text={code} />
        </div>
      </div>
      <pre className="console overflow-x-auto px-4 py-3 max-h-[340px] overflow-y-auto text-[11.5px]">{code}</pre>
    </div>
  );
}

function MessageContent({ content }: { content: string }) {
  const parts = splitParts(content);
  if (!parts.some((p) => p.type === 'code')) return <>{content}</>;
  return (
    <div className="space-y-2.5">
      {parts.map((p, i) =>
        p.type === 'code' ? <ArtifactCard key={i} lang={p.lang} code={p.code} /> : p.text.trim() ? (
          <div key={i} className="whitespace-pre-wrap">{p.text}</div>
        ) : null,
      )}
    </div>
  );
}

// ── Model picker pill (ChatGPT-style) ────────────────────────────────────────
function ModelPicker({
  pin, setPin, pool, puterModels,
}: {
  pin: string;
  setPin: (id: string) => void;
  pool: ModelInfo[];
  puterModels: Array<{ id: string; name: string; provider: string }> | null;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const current = pool.find((m) => m.id === pin);
  const live = puterModels ?? [];
  const query = q.trim().toLowerCase();
  const filter = (ms: ModelInfo[]) => (query ? ms.filter((m) => m.id.toLowerCase().includes(query) || m.name.toLowerCase().includes(query)) : ms);
  const own = filter(pool.filter((m) => m.runtime === 'aetherion-own'));
  const local = filter(pool.filter((m) => m.runtime !== 'aetherion-own' && m.runtime !== 'puter-cloud'));
  const puter = query
    ? live.filter((m) => m.id.toLowerCase().includes(query) || m.name.toLowerCase().includes(query)).slice(0, 40)
    : live.slice(0, 24);

  return (
    <div ref={boxRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="chip hover:opacity-100 !py-1.5"
        style={{ color: current ? 'var(--acc2)' : 'var(--dim)', borderColor: current ? 'color-mix(in srgb, var(--acc2) 45%, var(--line))' : undefined }}
      >
        <Sparkles size={11} />
        {current ? current.name : 'auto (router)'}
        <ChevronDown size={11} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s ease' }} />
      </button>
      {open && (
        <div
          className="absolute bottom-full left-0 mb-2 w-[320px] max-h-[380px] overflow-y-auto glass-2 rounded-2xl p-2 z-50"
          style={{ boxShadow: '0 24px 70px -20px rgba(0,0,0,.6)' }}
        >
          <div className="pill-input !py-0 mb-2">
            <Search size={12} style={{ color: 'var(--dim)' }} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="search models…" autoFocus />
          </div>
          <button onClick={() => { setPin(''); setOpen(false); }} className="w-full text-left px-3 py-2 rounded-lg text-xs transition-colors" style={{ color: 'var(--ink)', background: !pin ? 'color-mix(in srgb, var(--acc) 14%, transparent)' : 'transparent' }}>
            auto (router) <span className="font-mono text-[9px]" style={{ color: 'var(--dim)' }}>— let the router decide</span>
          </button>
          {own.length > 0 && (
            <>
              <div className="font-mono text-[8px] tracking-widest px-3 pt-2 pb-1" style={{ color: 'var(--dim)' }}>OWN MODELS · ON-DEVICE</div>
              {own.map((m) => (
                <button key={m.id} onClick={() => { setPin(m.id); setOpen(false); }} className="w-full text-left px-3 py-2 rounded-lg text-xs transition-colors" style={{ color: m.id === pin ? 'var(--acc2)' : 'var(--ink)', background: m.id === pin ? 'color-mix(in srgb, var(--acc) 14%, transparent)' : 'transparent' }}>
                  {m.name} <span className="font-mono text-[9px]" style={{ color: 'var(--ok)' }}>offline ✓</span>
                </button>
              ))}
            </>
          )}
          {local.length > 0 && (
            <>
              <div className="font-mono text-[8px] tracking-widest px-3 pt-2 pb-1" style={{ color: 'var(--dim)' }}>LOCAL & API</div>
              {local.map((m) => (
                <button key={m.id} onClick={() => { setPin(m.id); setOpen(false); }} className="w-full text-left px-3 py-2 rounded-lg text-xs transition-colors" style={{ color: m.id === pin ? 'var(--acc2)' : 'var(--ink)' }}>
                  {m.name}
                </button>
              ))}
            </>
          )}
          {puter.length > 0 && (
            <>
              <div className="font-mono text-[8px] tracking-widest px-3 pt-2 pb-1" style={{ color: 'var(--dim)' }}>PUTER GATEWAY · {live.length} LIVE</div>
              {puter.map((m) => (
                <button key={m.id} onClick={() => { setPin(m.id); setOpen(false); }} className="w-full text-left px-3 py-2 rounded-lg text-xs transition-colors" style={{ color: m.id === pin ? 'var(--acc2)' : 'var(--ink)' }}>
                  <span className="truncate">{m.name}</span> <span className="font-mono text-[9px] truncate" style={{ color: 'var(--dim)' }}>{m.provider}</span>
                </button>
              ))}
              {live.length === 0 && (
                <div className="px-3 py-2 text-[10px]" style={{ color: 'var(--dim)' }}>
                  Sign in to Puter (Settings) to use the 500+ gateway models here.
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function ChatPage() {
  const { s, mutate, trace, act } = useSutra();
  const puterAi = usePuterAi();
  const [convId, setConvId] = useState(s.conversations[0]?.id ?? '');
  const [input, setInput] = useState('');
  const [pin, setPin] = useState('');
  const [convSearch, setConvSearch] = useState('');
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

  const filteredConvs = useMemo(() => {
    const q = convSearch.trim().toLowerCase();
    return q ? s.conversations.filter((c) => c.title.toLowerCase().includes(q)) : s.conversations;
  }, [s.conversations, convSearch]);

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
          <div className="pill-input !py-0 mt-2.5">
            <Search size={12} style={{ color: 'var(--dim)' }} />
            <input value={convSearch} onChange={(e) => setConvSearch(e.target.value)} placeholder="search conversations…" />
            {convSearch && (
              <button onClick={() => setConvSearch('')} className="p-1" style={{ color: 'var(--dim)' }}>
                <X size={12} />
              </button>
            )}
          </div>
          <div className="mt-2.5 space-y-1 max-h-[220px] overflow-y-auto">
            {filteredConvs.map((c) => (
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
            {filteredConvs.length === 0 && (
              <div className="text-[10px] px-2 py-1" style={{ color: 'var(--dim)' }}>no conversations match</div>
            )}
          </div>
        </div>

        {/* Own-model family */}
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
              own models + {puterAi.models ? `${puterAi.models.length} Puter` : 'Puter gateway'} + local runtimes
            </div>
          </div>
        </div>

        {/* messages */}
        <div className="relative flex-1 overflow-y-auto p-5 space-y-5">
          {conv?.messages.map((m) => (
            <motion.div key={m.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
              <div className={`max-w-[85%] ${m.role === 'user' ? 'msg-user' : 'msg-assistant'}`}>
                <MessageContent content={m.content} />
              </div>
              {m.role === 'assistant' && (
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <span className="chip !text-[9px]" style={{ color: 'var(--acc2)' }}>routed: {m.route?.chosenName ?? m.model}</span>
                  {m.route?.analysis && <span className="chip !text-[9px]">{m.route.analysis}</span>}
                  {m.route?.reasons.slice(0, 2).map((r) => (
                    <span key={r} className="chip !text-[9px]" style={{ color: 'var(--dim)' }}>{r}</span>
                  ))}
                  <CopyButton text={m.content} />
                </div>
              )}
              {m.role === 'user' && (
                <div className="mt-1.5"><CopyButton text={m.content} /></div>
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
                Six own models run right here — math, code, summaries, data, stories — zero keys, zero network. Pick a model in the pill below, or let the router decide.
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
        <div className="relative p-4 border-t space-y-2.5" style={{ borderColor: 'var(--line)' }}>
          <ModelPicker pin={pin} setPin={setPin} pool={pool} puterModels={puterAi.models} />
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
          <div className="flex items-center justify-between font-mono text-[9px] tracking-wider" style={{ color: 'var(--dim)' }}>
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
