'use client';
// Lumen — Knowledge: ingest → chunk → embed → retrieve → rerank → answer.

import React, { useMemo, useRef, useState } from 'react';
import { Database, Upload, FileText } from 'lucide-react';
import { useSutra } from '@/lib/store';
import { GlassPanel, SectionTitle, Stat, LogConsole } from '@/components/ui';
import { ingestText, retrieve, generate, type Hit } from '@/lib/rag';
import { SAMPLE_DOC_TEXT } from '@/lib/seed';

export default function KnowledgePage() {
  const { s, mutate, act, trace } = useSutra();
  const [paste, setPaste] = useState('');
  const [title, setTitle] = useState('');
  const [q, setQ] = useState('What is Lumen\'s security model?');
  const [answer, setAnswer] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const addLog = (x: string) => setLog((l) => [...l, `[${new Date().toLocaleTimeString()}] ${x}`]);

  const ingest = (text: string, t: string, source: string) => {
    if (!text.trim()) return;
    const { doc, chunks } = ingestText(t || 'Untitled', text, source, 'text');
    mutate((st) => ({
      ...st,
      knowledge: [doc, ...st.knowledge],
      chunks: [...st.chunks, ...chunks],
    }));
    addLog(`ingest → parse → chunk: ${doc.title} · ${chunks.length} chunks · 384-dim local embeddings`);
    act('knowledge', `ingested ${doc.title}`, `${chunks.length} chunks`);
  };

  const onFile = (f: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? '');
      ingest(text, f.name, `upload: ${f.name}`);
    };
    reader.readAsText(f);
  };

  const ask = async () => {
    setBusy(true);
    setAnswer('');
    setHits([]);
    const tr = trace('rag.query');
    const t0 = Date.now();
    addLog(`retrieve: "${q.slice(0, 50)}" over ${s.chunks.length} chunks`);
    const t1 = Date.now();
    const r = await generate(s.chunks, q, s.models, s.settings);
    tr.span('rag.retrieve', t1 - t0, { hits: String(r.hits.length) });
    const t2 = Date.now();
    addLog(`rerank: top ${r.hits.length} · dense 0.55 / bm25 0.45`);
    tr.span('rag.generate', Date.now() - t2, { model: r.model });
    const id = tr.end();
    setHits(r.hits.slice(0, 4));
    setAnswer(r.answer);
    act('knowledge', 'rag query answered', `model: ${r.model}`, id);
    setBusy(false);
  };

  const totalChars = s.knowledge.reduce((a, d) => a + d.chars, 0);

  return (
    <div className="space-y-6">
      <SectionTitle
        overline="knowledge · rag"
        title="Ingest once. Answer with citations."
        sub="Documents, text, uploads — chunked, embedded locally, retrieved with a dense+BM25 blend, and generated with visible sources."
      />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="documents" value={s.knowledge.length} />
        <Stat label="chunks" value={s.chunks.length} sub="420 chars · 90 overlap" tone="acc2" />
        <Stat label="total size" value={`${(totalChars / 1000).toFixed(1)}k`} sub="characters, local index" />
        <Stat label="embeddings" value="384d" sub="deterministic local hash-embed" tone="acc" />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="space-y-4">
          <GlassPanel className="p-5">
            <div className="font-mono text-[10px] tracking-widest mb-3" style={{ color: 'var(--acc2)' }}>INGEST</div>
            <div className="flex flex-col gap-2">
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="document title" className="glass-2 px-3 py-2 text-sm outline-none" style={{ color: 'var(--ink)' }} />
              <textarea
                value={paste}
                onChange={(e) => setPaste(e.target.value)}
                rows={5}
                placeholder="paste text, specs, notes…"
                className="glass-2 w-full px-3 py-2 text-sm outline-none resize-none"
                style={{ color: 'var(--ink)' }}
              />
              <div className="flex flex-wrap gap-2">
                <button onClick={() => { ingest(paste, title || 'Pasted document', 'pasted text'); setPaste(''); setTitle(''); }} disabled={!paste.trim()} className="btn-primary !py-2 text-xs" style={{ opacity: paste.trim() ? 1 : 0.4 }}>
                  Ingest text
                </button>
                <button onClick={() => fileRef.current?.click()} className="btn-ghost !py-2 text-xs">
                  <Upload size={13} /> Upload file
                </button>
                <input ref={fileRef} type="file" accept=".txt,.md,.json,.ts,.js,.py" hidden onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
                <button onClick={() => ingest(SAMPLE_DOC_TEXT, 'Lumen Design Principles (re-ingest)', 'bundled document')} className="btn-ghost !py-2 text-xs">
                  <FileText size={13} /> Re-ingest sample
                </button>
              </div>
            </div>
          </GlassPanel>
          <GlassPanel className="p-5">
            <div className="font-mono text-[10px] tracking-widest mb-3" style={{ color: 'var(--acc2)' }}>DOCUMENTS</div>
            <div className="space-y-2 max-h-[240px] overflow-y-auto">
              {s.knowledge.map((d) => (
                <div key={d.id} className="glass-2 p-3 flex items-center gap-3">
                  <Database size={14} style={{ color: 'var(--acc2)' }} />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium truncate">{d.title}</div>
                    <div className="font-mono text-[9px]" style={{ color: 'var(--dim)' }}>
                      {d.kind} · {d.chunkCount} chunks · {(d.chars / 1000).toFixed(1)}k chars
                    </div>
                  </div>
                  <button
                    onClick={() => mutate((st) => ({ ...st, knowledge: st.knowledge.filter((x) => x.id !== d.id), chunks: st.chunks.filter((c) => c.docId !== d.id) }))}
                    className="chip !text-[9px]"
                    style={{ cursor: 'pointer', color: 'var(--bad)' }}
                  >
                    remove
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-3 font-mono text-[9px]" style={{ color: 'var(--dim)' }}>sources: documents · websites · github · databases · apis · folders</div>
          </GlassPanel>
        </div>

        <div className="space-y-4">
          <GlassPanel className="p-5">
            <div className="font-mono text-[10px] tracking-widest mb-3" style={{ color: 'var(--acc2)' }}>QUERY</div>
            <div className="flex flex-col gap-2">
              <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void ask()} className="glass-2 px-3 py-2.5 text-sm outline-none" style={{ color: 'var(--ink)' }} placeholder="ask the knowledge base…" />
              <button onClick={() => void ask()} disabled={busy} className="btn-primary !py-2 text-xs" style={{ opacity: busy ? 0.5 : 1 }}>
                {busy ? 'Retrieving → reranking → generating…' : 'Ask with citations'}
              </button>
            </div>
            {answer && (
              <div className="mt-4 glass-2 p-4 text-sm leading-relaxed whitespace-pre-wrap">{answer}</div>
            )}
            {hits.length > 0 && (
              <div className="mt-3 space-y-2">
                <div className="font-mono text-[10px] tracking-widest" style={{ color: 'var(--dim)' }}>SOURCES</div>
                {hits.map((h, i) => (
                  <div key={h.chunk.id} className="glass-2 p-3">
                    <div className="font-mono text-[9px] mb-1" style={{ color: 'var(--acc2)' }}>
                      [{i + 1}] {h.chunk.heading} · score {h.score.toFixed(3)}
                    </div>
                    <div className="text-[11px] leading-relaxed line-clamp-3" style={{ color: 'var(--dim)' }}>{h.chunk.text}</div>
                  </div>
                ))}
              </div>
            )}
          </GlassPanel>
          <GlassPanel className="p-4">
            <div className="font-mono text-[10px] tracking-widest mb-2" style={{ color: 'var(--acc2)' }}>PIPELINE LOG</div>
            <LogConsole lines={log.length ? log : ['no ingestions this session yet']} maxHeight={140} />
          </GlassPanel>
        </div>
      </div>
    </div>
  );
}
