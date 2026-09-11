'use client';
// Lumen Studio — one creative workspace: Images · Video · Audio · Documents · Apps.
// Every mode uses the same project shelf (Library). Cloud generation is real
// (Puter gateway / embedded media router) and honestly marked when it needs
// a connection; document generation works fully offline via the own models.

import React, { useEffect, useMemo, useState } from 'react';
import {
  FileCode2, FileText, Film, Image as ImageIcon, Music, Play, Plus, Sparkles,
} from 'lucide-react';
import { GlassPanel } from '@/components/ui';
import { usePuterAi } from '@/lib/puter';
import { runLocalModel } from '@/lib/localmodels/registry';
import { planProject } from '@/lib/coder/engine';
import { useSutra } from '@/lib/store';
import { uid } from '@sutra/shared';
import { BRAND } from '@/lib/brand';

type Mode = 'images' | 'video' | 'audio' | 'documents' | 'apps';
const MODES: Array<{ id: Mode; label: string; icon: React.ComponentType<{ size?: number | string }> }> = [
  { id: 'images', label: 'Images', icon: ImageIcon },
  { id: 'video', label: 'Video', icon: Film },
  { id: 'audio', label: 'Audio', icon: Music },
  { id: 'documents', label: 'Documents', icon: FileText },
  { id: 'apps', label: 'Apps', icon: FileCode2 },
];

interface MediaItem {
  id: string; type: 'image' | 'video' | 'audio' | 'document';
  prompt: string; src?: string; text?: string; createdAt: number; mode: string;
}

const MEDIA_KEY = 'lumen:media:v1';
function loadMedia(): MediaItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const j = JSON.parse(localStorage.getItem(MEDIA_KEY) ?? '[]') as MediaItem[];
    return Array.isArray(j) ? j : [];
  } catch { return []; }
}
function saveMedia(items: MediaItem[]) {
  if (typeof window !== 'undefined') localStorage.setItem(MEDIA_KEY, JSON.stringify(items.slice(0, 200)));
}

export default function StudioPage() {
  const { s, act } = useSutra();
  const puterAi = usePuterAi();
  const [mode, setMode] = useState<Mode>('images');
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [online, setOnline] = useState(true);

  // documents state
  const [docTitle, setDocTitle] = useState('');
  const [docOutline, setDocOutline] = useState('Introduction\nKey points\nConclusion');
  const [docText, setDocText] = useState('');

  // apps state
  const [appPrompt, setAppPrompt] = useState('');

  useEffect(() => { setMedia(loadMedia()); }, []);
  useEffect(() => {
    const iv = window.setInterval(() => {
      fetch('/api/status', { cache: 'no-store' }).then((r) => setOnline(r.ok)).catch(() => setOnline(false));
    }, 20000);
    return () => window.clearInterval(iv);
  }, []);

  const addMedia = (item: Omit<MediaItem, 'id' | 'createdAt'>) => {
    const next = [{ ...item, id: uid('m'), createdAt: Date.now() }, ...media];
    setMedia(next);
    saveMedia(next);
  };

  const generateImage = async () => {
    if (!prompt.trim()) return;
    setBusy(true); setError(null);
    try {
      if (!puterAi.available) {
        setError('Image generation requires a connection — sign in to Puter (Settings) to unlock the image models.');
        return;
      }
      const res = await puterAi.image(prompt);
      if (!res) {
        setError('The gateway did not return an image. Check your Puter connection and monthly usage.');
        return;
      }
      addMedia({ type: 'image', prompt, src: res.src, mode: 'images' });
      act('studio', 'image generated', prompt.slice(0, 60), undefined);
      setPrompt('');
    } catch (e) {
      setError(String((e as Error).message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const generateMedia = async (kind: 'video' | 'audio') => {
    if (!prompt.trim()) return;
    setBusy(true); setError(null);
    try {
      if (!online) {
        setError(`${kind === 'video' ? 'Video' : 'Audio'} generation requires a connection. Chat and documents keep working offline.`);
        return;
      }
      const res = await fetch('/api/media/generate', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind, prompt }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      addMedia({ type: kind, prompt, src: j.url ?? j.src ?? undefined, mode: kind });
      act('studio', `${kind} generated`, prompt.slice(0, 60), undefined);
      setPrompt('');
    } catch (e) {
      setError(String((e as Error).message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const buildDocument = () => {
    if (!docTitle.trim()) return;
    setBusy(true); setError(null);
    const sections = docOutline.split('\n').map((x) => x.trim()).filter(Boolean);
    const parts = sections.map((sec, i) => {
      const draftRaw = runLocalModel('aetherion-writer', `Write a short, factual section titled "${sec}" for the document "${docTitle}". Keep it concise and useful.`);
      const draft = (draftRaw && 'content' in draftRaw ? String(draftRaw.content) : '') || `Section: ${sec}`;
      const body = draft.split('\n').slice(2).join('\n').trim() || draft;
      return `## ${sec}\n\n${body}\n`;
    });
    const md = `# ${docTitle}\n\n*Generated in ${BRAND.product} — Document Studio (on-device).*\n\n${parts.join('\n')}`;
    setDocText(md);
    addMedia({ type: 'document', prompt: docTitle, text: md, mode: 'documents' });
    act('studio', 'document generated', docTitle, undefined);
    setBusy(false);
  };

  const download = (item: MediaItem) => {
    const blob = new Blob([item.text ?? ''], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${item.prompt.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40) || 'document'}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const buildApp = () => {
    if (!appPrompt.trim()) return;
    const plan = planProject(appPrompt);
    if (plan.kind === 'unknown') { setError(plan.summary); return; }
    const project = { id: uid('proj'), name: plan.name, createdAt: new Date().toISOString(), files: plan.files, request: appPrompt };
    const key = 'lumen:coder:v1';
    const existing = (() => { try { return JSON.parse(localStorage.getItem(key) ?? '[]'); } catch { return []; } })() as unknown[];
    localStorage.setItem(key, JSON.stringify([project, ...existing].slice(0, 50)));
    act('coder', 'project scaffolded', plan.name, undefined);
    window.location.href = '/workspace/coder';
  };

  const recent = useMemo(() => media.filter((m) => m.mode === mode), [media, mode]);

  return (
    <div className="space-y-6">
      <div>
        <div className="overline mb-2">studio</div>
        <div className="display-1">One studio. Every output<span className="text-grad">.</span></div>
        <div className="text-sm mt-2 max-w-2xl leading-relaxed" style={{ color: 'var(--dim)' }}>
          Images, video, audio, documents and apps — created here, saved to your Library, reusable anywhere in {BRAND.name}.
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {MODES.map((m) => (
          <button
            key={m.id}
            onClick={() => setMode(m.id)}
            className="chip hover:opacity-100 !py-2"
            style={{ color: mode === m.id ? 'var(--acc2)' : 'var(--dim)', borderColor: mode === m.id ? 'color-mix(in srgb, var(--acc2) 50%, var(--line))' : undefined }}
          >
            <m.icon size={12} /> {m.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="glass p-3 font-mono text-[11px]" style={{ color: 'var(--warn)', borderColor: 'color-mix(in srgb, var(--warn) 40%, var(--line))' }}>
          ⚠ {error}
        </div>
      )}

      {mode === 'images' && (
        <GlassPanel className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="font-mono text-[10px] tracking-widest" style={{ color: 'var(--acc2)' }}>
              IMAGE STUDIO · PUTER GATEWAY{puterAi.available ? ' · connected' : ' · connect in settings'}
            </div>
            <span className="chip !text-[9px]" style={{ color: puterAi.available ? 'var(--ok)' : 'var(--warn)' }}>
              {puterAi.available ? 'text → image available' : 'requires connection'}
            </span>
          </div>
          <div className="pill-input">
            <Sparkles size={14} style={{ color: 'var(--dim)' }} />
            <input value={prompt} onChange={(e) => setPrompt(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void generateImage()} placeholder="describe the image — e.g. a solar charging station at dusk, cinematic" />
            <button onClick={() => void generateImage()} disabled={busy || !prompt.trim()} className="btn-primary !px-4 !py-2" style={{ opacity: busy || !prompt.trim() ? 0.5 : 1 }}>
              <Plus size={14} /> generate
            </button>
          </div>
          {recent.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {recent.map((m) => (
                <div key={m.id} className="glass-2 rounded-xl overflow-hidden">
                  {m.src ? <img src={m.src} alt={m.prompt} className="w-full aspect-square object-cover" /> : <div className="aspect-square grid place-items-center" style={{ background: 'var(--panel-2)' }}><ImageIcon size={20} style={{ color: 'var(--dim)' }} /></div>}
                  <div className="p-2 text-[10px] truncate" style={{ color: 'var(--dim)' }}>{m.prompt}</div>
                </div>
              ))}
            </div>
          )}
          {recent.length === 0 && (
            <div className="text-xs" style={{ color: 'var(--dim)' }}>
              Generated images land here and in your Library. {!puterAi.available && 'Sign in to Puter in Settings to enable generation.'}
            </div>
          )}
        </GlassPanel>
      )}

      {mode === 'video' && (
        <GlassPanel className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="font-mono text-[10px] tracking-widest" style={{ color: 'var(--acc2)' }}>VIDEO STUDIO · EMBEDDED MEDIA ROUTER</div>
            <span className="chip !text-[9px]" style={{ color: online ? 'var(--ok)' : 'var(--warn)' }}>{online ? 'online · provider keys decide availability' : 'requires connection'}</span>
          </div>
          <div className="pill-input">
            <Film size={14} style={{ color: 'var(--dim)' }} />
            <input value={prompt} onChange={(e) => setPrompt(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void generateMedia('video')} placeholder="describe the clip — e.g. a drone shot over a solar farm at sunrise" />
            <button onClick={() => void generateMedia('video')} disabled={busy || !prompt.trim()} className="btn-primary !px-4 !py-2" style={{ opacity: busy || !prompt.trim() ? 0.5 : 1 }}>
              <Play size={14} /> generate
            </button>
          </div>
          {recent.length > 0 && (
            <div className="space-y-2">
              {recent.map((m) => (
                <div key={m.id} className="glass-2 rounded-xl p-3">
                  {m.src ? <video src={m.src} controls className="w-full rounded-lg max-h-[300px]" /> : <div className="text-xs" style={{ color: 'var(--dim)' }}>{m.prompt}</div>}
                  <div className="text-[10px] mt-1.5 truncate" style={{ color: 'var(--dim)' }}>{m.prompt}</div>
                </div>
              ))}
            </div>
          )}
        </GlassPanel>
      )}

      {mode === 'audio' && (
        <GlassPanel className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="font-mono text-[10px] tracking-widest" style={{ color: 'var(--acc2)' }}>AUDIO STUDIO · VOICE & MUSIC</div>
            <span className="chip !text-[9px]" style={{ color: online ? 'var(--ok)' : 'var(--warn)' }}>{online ? 'online · provider keys decide availability' : 'requires connection'}</span>
          </div>
          <div className="pill-input">
            <Music size={14} style={{ color: 'var(--dim)' }} />
            <input value={prompt} onChange={(e) => setPrompt(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void generateMedia('audio')} placeholder="describe the sound — e.g. calm synthwave intro for a tech podcast" />
            <button onClick={() => void generateMedia('audio')} disabled={busy || !prompt.trim()} className="btn-primary !px-4 !py-2" style={{ opacity: busy || !prompt.trim() ? 0.5 : 1 }}>
              <Play size={14} /> generate
            </button>
          </div>
          {recent.map((m) => (
            <div key={m.id} className="glass-2 rounded-xl p-3">
              {m.src ? <audio src={m.src} controls className="w-full" /> : null}
              <div className="text-[10px] mt-1 truncate" style={{ color: 'var(--dim)' }}>{m.prompt}</div>
            </div>
          ))}
        </GlassPanel>
      )}

      {mode === 'documents' && (
        <div className="grid lg:grid-cols-2 gap-5">
          <GlassPanel className="p-5 space-y-3">
            <div className="font-mono text-[10px] tracking-widest" style={{ color: 'var(--acc2)' }}>DOCUMENT STUDIO · ON-DEVICE</div>
            <input value={docTitle} onChange={(e) => setDocTitle(e.target.value)} placeholder="document title — e.g. Solar EV Charging: Project Report" className="glass-2 w-full px-3 py-2.5 text-sm outline-none" style={{ color: 'var(--ink)' }} />
            <textarea value={docOutline} onChange={(e) => setDocOutline(e.target.value)} rows={5} placeholder="one section per line" className="glass-2 w-full px-3 py-2.5 text-sm outline-none resize-y" style={{ color: 'var(--ink)' }} />
            <button onClick={buildDocument} disabled={busy || !docTitle.trim()} className="btn-primary w-full justify-center disabled:opacity-50">
              <FileText size={14} /> draft the document (on-device)
            </button>
            {docText && (
              <button onClick={() => download({ id: 'doc', type: 'document', prompt: docTitle, text: docText, createdAt: 0, mode: 'documents' })} className="btn-ghost w-full justify-center text-xs">
                download .md
              </button>
            )}
          </GlassPanel>
          <GlassPanel className="p-5">
            <div className="font-mono text-[10px] tracking-widest mb-3" style={{ color: 'var(--acc2)' }}>PREVIEW</div>
            {docText ? (
              <pre className="console overflow-auto max-h-[420px] whitespace-pre-wrap text-[11px]">{docText}</pre>
            ) : (
              <div className="text-xs leading-relaxed" style={{ color: 'var(--dim)' }}>
                The document pipeline runs entirely on-device: each section is drafted by the local writer model, assembled into Markdown, and stored in the Library. Move any Chat answer here the same way — nothing leaves the machine.
              </div>
            )}
          </GlassPanel>
        </div>
      )}

      {mode === 'apps' && (
        <GlassPanel className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="font-mono text-[10px] tracking-widest" style={{ color: 'var(--acc2)' }}>APP STUDIO → CODER</div>
            <span className="chip !text-[9px]" style={{ color: 'var(--ok)' }}>scaffolding runs on-device</span>
          </div>
          <div className="pill-input">
            <FileCode2 size={14} style={{ color: 'var(--dim)' }} />
            <input value={appPrompt} onChange={(e) => setAppPrompt(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && buildApp()} placeholder="describe the app — e.g. build a React app called Solar Monitor with a live metrics dashboard" />
            <button onClick={buildApp} disabled={busy || !appPrompt.trim()} className="btn-primary !px-4 !py-2" style={{ opacity: busy || !appPrompt.trim() ? 0.5 : 1 }}>
              scaffold
            </button>
          </div>
          <div className="text-xs leading-relaxed" style={{ color: 'var(--dim)' }}>
            Describe what you want to build. The planner decides the right architecture (React + Vite, static site, Node API or Python script), the architect scaffolds every file, the tester lints it and the security reviewer checks for secrets — then it opens in Coder for editing, running and shipping.
          </div>
        </GlassPanel>
      )}
    </div>
  );
}
