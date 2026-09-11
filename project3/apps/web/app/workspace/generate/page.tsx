'use client';
// SUTRA Generate — the fabrication studio.
// Image · Deck (PPTX) · 3D models. Puter AI gateway when signed in
// (photoreal images, AI outlines); deterministic on-device fabrication
// otherwise. Everything exports to open formats.

import React, { useEffect, useRef, useState } from 'react';
import { Download, FileText, Image as ImageIcon, RefreshCw, Sparkles, Box } from 'lucide-react';
import { GlassPanel, SectionTitle } from '@/components/ui';
import { usePuterAi } from '@/lib/puter';
import { artSpecFor, paintArt } from '@/lib/fabricate/art';
import { aiOutline, localOutline } from '@/lib/fabricate/deck';
import type { Slide } from '@/lib/fabricate/pptx';
import { buildPptx, slidesHtml } from '@/lib/fabricate/pptx';
import { meshFromPrompt, meshLabel } from '@/lib/fabricate/geometry';
import { meshToGltf, meshToObj } from '@/lib/fabricate/exporters';
import { renderMesh } from '@/lib/fabricate/render3d';
import { useSutra } from '@/lib/store';

type Tab = 'image' | 'deck' | '3d';

function downloadBlob(name: string, data: Uint8Array | string, type: string) {
  // copy into an ArrayBuffer-backed view so TS + Blob agree on BlobPart
  const part: BlobPart = typeof data === 'string' ? data : new Uint8Array(data);
  const url = URL.createObjectURL(new Blob([part], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export default function GeneratePage() {
  const { act } = useSutra();
  const puter = usePuterAi();
  const [tab, setTab] = useState<Tab>('image');

  return (
    <div className="space-y-6">
      <SectionTitle
        overline="generate"
        title="Fabrication studio."
        sub={`Images, decks and 3D models. ${puter.available ? 'Puter AI gateway connected — photoreal images and AI outlines.' : 'Local fabrication is always on; connect Puter for AI-grade output.'}`}
      />
      <div className="flex flex-wrap gap-2">
        {(
          [
            ['image', 'Image', ImageIcon],
            ['deck', 'Presentation', FileText],
            ['3d', '3D model', Box],
          ] as Array<[Tab, string, React.ComponentType<{ size?: number | string }>]>
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className="btn-ghost !py-2 !px-4 text-xs"
            style={tab === id ? { borderColor: 'var(--acc)', color: 'var(--ink)', background: 'color-mix(in srgb, var(--acc) 12%, transparent)' } : undefined}
          >
            <Icon size={13} /> {label}
          </button>
        ))}
      </div>
      {tab === 'image' && <ImageStudio puterAvailable={puter.available} image={puter.image} />}
      {tab === 'deck' && <DeckStudio chat={puter.available ? puter.chat : null} />}
      {tab === '3d' && <MeshStudio onMade={(label) => act('generate', `3D · ${label}`, 'fabricated from prompt', undefined)} />}
    </div>
  );
}

/* ────────────────────────────── image ────────────────────────────── */

function ImageStudio(props: {
  puterAvailable: boolean;
  image: (prompt: string, opts?: { width?: number; height?: number }) => Promise<{ src: string; prompt: string } | null>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [prompt, setPrompt] = useState('a neon temple floating over a violet ocean at midnight');
  const [busy, setBusy] = useState(false);
  const [src, setSrc] = useState<string | null>(null);
  const [via, setVia] = useState<'puter' | 'local' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    const p = prompt.trim();
    if (!p || busy) return;
    setBusy(true);
    setError(null);
    setSrc(null);
    try {
      const ai = props.puterAvailable ? await props.image(p, { width: 1024, height: 1024 }) : null;
      if (ai?.src) {
        setSrc(ai.src);
        setVia('puter');
      } else {
        const canvas = canvasRef.current;
        if (!canvas) throw new Error('no canvas');
        const spec = artSpecFor(p, 1024, 1024);
        canvas.width = spec.width;
        canvas.height = spec.height;
        paintArt(canvas.getContext('2d')!, spec);
        setSrc(canvas.toDataURL('image/png'));
        setVia('local');
      }
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    if (!src) return;
    if (src.startsWith('data:')) {
      const bin = atob(src.split(',')[1]);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      downloadBlob(`sutra-${prompt.trim().slice(0, 24).replace(/\W+/g, '-') || 'art'}.png`, bytes, 'image/png');
    } else {
      const a = document.createElement('a');
      a.href = src;
      a.download = 'sutra-image';
      a.target = '_blank';
      a.rel = 'noreferrer';
      a.click();
    }
  };

  return (
    <GlassPanel className="p-5 space-y-4">
      <div className="font-mono text-[10px] tracking-widest" style={{ color: 'var(--acc2)' }}>
        IMAGE · {props.puterAvailable ? 'puter ai gateway (photoreal)' : 'local generative art (connect Puter for photoreal)'}
      </div>
      <div className="flex flex-col md:flex-row gap-3">
        <input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void generate()}
          className="glass-2 flex-1 px-4 py-3 text-sm outline-none"
          style={{ color: 'var(--ink)' }}
          placeholder="describe the image…"
        />
        <button onClick={() => void generate()} disabled={busy} className="btn-primary self-start disabled:opacity-50">
          <Sparkles size={13} /> {busy ? 'rendering…' : 'generate'}
        </button>
      </div>
      {error && <div className="font-mono text-[11px]" style={{ color: 'var(--warn)' }}>⚠ {error}</div>}
      {src && (
        <div className="flex flex-col md:flex-row gap-4 items-start">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={prompt} className="rounded-xl border max-w-full md:max-w-[520px]" style={{ borderColor: 'var(--line)' }} />
          <div className="space-y-3">
            <div className="chip !text-[10px]" style={{ color: via === 'puter' ? 'var(--ok)' : 'var(--acc2)' }}>
              {via === 'puter' ? 'generated by Puter AI' : 'generated on-device · deterministic seed'}
            </div>
            <button onClick={save} className="btn-ghost !py-2 !px-3 text-xs">
              <Download size={13} /> save PNG
            </button>
            <button onClick={() => void generate()} disabled={busy} className="btn-ghost !py-2 !px-3 text-xs disabled:opacity-50">
              <RefreshCw size={13} /> regenerate
            </button>
          </div>
        </div>
      )}
      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </GlassPanel>
  );
}

/* ────────────────────────────── deck ────────────────────────────── */

function DeckStudio(props: { chat: ((msgs: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>, opts?: object) => Promise<{ content: string } | null>) | null }) {
  const [topic, setTopic] = useState('Project 3 — SUTRA: the open AI ecosystem');
  const [busy, setBusy] = useState(false);
  const [deck, setDeck] = useState<{ title: string; slides: Slide[]; via: 'puter' | 'local' } | null>(null);

  const generate = async () => {
    const t = topic.trim();
    if (!t || busy) return;
    setBusy(true);
    try {
      const d = props.chat ? await aiOutline(t, props.chat) : { ...localOutline(t), via: 'local' as const };
      setDeck(d);
    } finally {
      setBusy(false);
    }
  };

  const exportPptx = () => {
    if (!deck) return;
    downloadBlob(`${deck.title.slice(0, 32).replace(/\W+/g, '-') || 'deck'}.pptx`, buildPptx(deck.slides), 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
  };

  const exportHtml = () => {
    if (!deck) return;
    downloadBlob(`${deck.title.slice(0, 32).replace(/\W+/g, '-') || 'deck'}.html`, slidesHtml(deck.title, deck.slides), 'text/html');
  };

  return (
    <GlassPanel className="p-5 space-y-4">
      <div className="font-mono text-[10px] tracking-widest" style={{ color: 'var(--acc2)' }}>
        PRESENTATION · {props.chat ? 'ai outline via puter gateway' : 'local outline (connect Puter for AI outlines)'}
      </div>
      <div className="flex flex-col md:flex-row gap-3">
        <input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void generate()}
          className="glass-2 flex-1 px-4 py-3 text-sm outline-none"
          style={{ color: 'var(--ink)' }}
          placeholder="deck topic…"
        />
        <button onClick={() => void generate()} disabled={busy} className="btn-primary self-start disabled:opacity-50">
          <Sparkles size={13} /> {busy ? 'drafting…' : 'generate deck'}
        </button>
      </div>
      {deck && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <span className="chip !text-[10px]" style={{ color: deck.via === 'puter' ? 'var(--ok)' : 'var(--acc2)' }}>
              {deck.via === 'puter' ? 'AI outline · Puter gateway' : 'local outline · deterministic'}
            </span>
            <button onClick={exportPptx} className="btn-primary !py-2 !px-3 text-xs">
              <Download size={13} /> export .pptx
            </button>
            <button onClick={exportHtml} className="btn-ghost !py-2 !px-3 text-xs">
              <Download size={13} /> export .html
            </button>
          </div>
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
            {deck.slides.map((s, i) => (
              <div key={i} className="glass-2 rounded-xl p-4 min-h-[220px] border" style={{ borderColor: 'var(--line)' }}>
                <div className="font-mono text-[9px] tracking-widest mb-2" style={{ color: 'var(--dim)' }}>
                  SLIDE {String(i + 1).padStart(2, '0')}
                </div>
                <div className="text-grad font-semibold text-lg mb-3">{s.title}</div>
                <ul className="space-y-1.5">
                  {s.bullets.map((b, j) => (
                    <li key={j} className="text-xs flex gap-2" style={{ color: 'var(--ink-2)' }}>
                      <span style={{ color: 'var(--acc2)' }}>▸</span> {b}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </>
      )}
    </GlassPanel>
  );
}

/* ────────────────────────────── 3d ────────────────────────────── */

function MeshStudio(props: { onMade: (label: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [prompt, setPrompt] = useState('a twisted glass tower');
  const [meshName, setMeshName] = useState<string | null>(null);
  const [promptKey, setPromptKey] = useState('');

  const mesh = meshName ? meshFromPrompt(meshName) : null;
  const label = meshName ? meshLabel(meshName) : null;

  useEffect(() => {
    if (!mesh || !canvasRef.current) return;
    const canvas = canvasRef.current;
    canvas.width = 560;
    canvas.height = 560;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let raf = 0;
    let ry = 0;
    let last = performance.now();
    const loop = (now: number) => {
      ry += (now - last) / 1400;
      last = now;
      renderMesh(ctx, mesh, { ry, rx: -0.42, scale: 1 });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [mesh, promptKey]);

  const make = () => {
    const p = prompt.trim();
    if (!p) return;
    setPromptKey(p);
    setMeshName(p);
    props.onMade(meshLabel(p));
  };

  const exportMesh = (ext: 'obj' | 'gltf') => {
    if (!mesh || !label) return;
    const data = ext === 'obj' ? meshToObj(mesh, label) : meshToGltf(mesh, label);
    downloadBlob(`sutra-${label}.${ext}`, data, ext === 'obj' ? 'text/plain' : 'model/gltf+json');
  };

  return (
    <GlassPanel className="p-5 space-y-4">
      <div className="font-mono text-[10px] tracking-widest" style={{ color: 'var(--acc2)' }}>
        3D MODEL · procedural fabrication · exports open formats (OBJ / GLTF)
      </div>
      <div className="flex flex-col md:flex-row gap-3">
        <input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && make()}
          className="glass-2 flex-1 px-4 py-3 text-sm outline-none"
          style={{ color: 'var(--ink)' }}
          placeholder="gear, ring, terrain, vase, twisted tower, rocket, column…"
        />
        <button onClick={make} className="btn-primary self-start">
          <Box size={13} /> fabricate
        </button>
      </div>
      {mesh && label && (
        <div className="flex flex-col lg:flex-row gap-4 items-start">
          <canvas ref={canvasRef} className="rounded-xl border max-w-full" style={{ borderColor: 'var(--line)', width: 420, height: 420 }} />
          <div className="space-y-3">
            <div className="chip !text-[10px]" style={{ color: 'var(--acc2)' }}>
              {mesh.positions.length / 3} vertices · {mesh.indices.length / 3} triangles · “{label}”
            </div>
            <button onClick={() => exportMesh('gltf')} className="btn-primary !py-2 !px-3 text-xs">
              <Download size={13} /> export .gltf
            </button>
            <button onClick={() => exportMesh('obj')} className="btn-ghost !py-2 !px-3 text-xs">
              <Download size={13} /> export .obj
            </button>
            <p className="text-[11px] max-w-[260px] leading-relaxed" style={{ color: 'var(--dim)' }}>
              Opens in Blender, Three.js, Windows 3D Viewer and Babylon.js sandbox. Same prompt → same object (deterministic).
            </p>
          </div>
        </div>
      )}
    </GlassPanel>
  );
}
