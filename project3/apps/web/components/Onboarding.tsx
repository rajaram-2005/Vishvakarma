'use client';
// Lumen Studio — first-run onboarding: name + professional packages.
// Packages shape recommendations (plugins, collections, chat starters)
// across the whole studio; everything stays user-editable.
import React, { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { BRAND, PERSONAS } from '@/lib/brand';
import { loadOnboarding, saveOnboarding } from '@/lib/onboarding';

export function Onboarding() {
  // Hydration-safe: render nothing on the server and on the client's first
  // pass; localStorage state is read only after mount.
  const [mounted, setMounted] = useState(false);
  const [state, setState] = useState<{ done: boolean }>({ done: true });
  const [name, setName] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [step, setStep] = useState<'intro' | 'packages' | 'done'>('intro');

  useEffect(() => {
    const ob = loadOnboarding();
    setState({ done: ob.done });
    setName(ob.name);
    setPicked(ob.personas);
    setMounted(true);
  }, []);

  if (!mounted || state.done) return null;

  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= 3 ? p : [...p, id]));

  const finish = () => {
    saveOnboarding({ name: name.trim(), personas: picked, done: true });
    setStep('done');
    setTimeout(() => window.location.reload(), 500);
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4" style={{ background: 'rgba(2,3,8,.6)', backdropFilter: 'blur(12px)' }}>
      <div className="glass-2 w-full max-w-2xl rounded-3xl p-7 relative overflow-hidden">
        <div className="aura-ring" />
        {step === 'intro' && (
          <div className="relative text-center py-6">
            <div className="font-mono text-[10px] tracking-[0.4em] mb-3" style={{ color: 'var(--acc2)' }}>
              {BRAND.product.toUpperCase()}
            </div>
            <div className="display-1 mb-3">{BRAND.tagline}</div>
            <p className="text-sm max-w-md mx-auto leading-relaxed" style={{ color: 'var(--dim)' }}>
              One chat. Every model. Create images, videos and documents, build software, store everything in your Library, and automate it all with Schedules — in a single workspace.
            </p>
            <div className="mt-6 flex items-center justify-center gap-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="what should we call you?"
                className="pill-input !py-0 w-64"
                onKeyDown={(e) => e.key === 'Enter' && setStep('packages')}
              />
              <button onClick={() => setStep('packages')} className="btn-primary !px-4 !py-2.5">
                continue <ArrowRight size={14} />
              </button>
            </div>
          </div>
        )}

        {step === 'packages' && (
          <div className="relative">
            <div className="font-mono text-[10px] tracking-[0.4em] mb-1" style={{ color: 'var(--acc2)' }}>
              PROFESSIONAL PACKAGES
            </div>
            <div className="display-2 mb-1">How will you use {BRAND.name}?</div>
            <p className="text-xs mb-4" style={{ color: 'var(--dim)' }}>
              Pick up to three — each tunes recommended models, plugins, library collections and chat starters. You can always change this later.
            </p>
            <div className="grid sm:grid-cols-2 gap-2 max-h-[300px] overflow-y-auto pr-1">
              {PERSONAS.map((p) => {
                const active = picked.includes(p.id);
                return (
                  <button
                    key={p.id}
                    onClick={() => toggle(p.id)}
                    className="glass-2 rounded-xl p-3 text-left transition-all"
                    style={{ borderColor: active ? 'color-mix(in srgb, var(--acc2) 60%, var(--line))' : 'var(--line)', background: active ? 'color-mix(in srgb, var(--acc) 14%, var(--panel))' : undefined }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-base">{p.emoji}</span>
                      <span className="text-[13px] font-semibold" style={{ color: 'var(--ink)' }}>{p.label}</span>
                      {active && <span className="ml-auto chip !text-[8px]" style={{ color: 'var(--acc2)' }}>selected</span>}
                    </div>
                    <div className="text-[10px] mt-1 leading-relaxed" style={{ color: 'var(--dim)' }}>{p.summary}</div>
                  </button>
                );
              })}
            </div>
            <div className="mt-4 flex items-center justify-between">
              <div className="text-[10px] font-mono" style={{ color: 'var(--dim)' }}>
                {picked.length}/3 packages · all optional
              </div>
              <button onClick={finish} className="btn-primary !px-5 !py-2.5">
                enter {BRAND.name} <ArrowRight size={14} />
              </button>
            </div>
          </div>
        )}

        {step === 'done' && (
          <div className="relative text-center py-10">
            <div className="display-2 mb-2">Welcome to {BRAND.product}.</div>
            <div className="text-sm" style={{ color: 'var(--dim)' }}>tuning your workspace…</div>
          </div>
        )}
      </div>
    </div>
  );
}
