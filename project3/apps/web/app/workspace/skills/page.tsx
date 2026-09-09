'use client';
// SUTRA — Skills: the HOW. Install, manage, inspect scopes.

import React from 'react';
import { Puzzle } from 'lucide-react';
import { useSutra } from '@/lib/store';
import { GlassPanel, SectionTitle } from '@/components/ui';

export default function SkillsPage() {
  const { s, mutate } = useSutra();

  const toggleInstall = (id: string) =>
    mutate((st) => ({ ...st, skills: st.skills.map((k) => (k.id === id ? { ...k, installed: !k.installed } : k)) }));

  const installed = s.skills.filter((k) => k.installed);
  const available = s.skills.filter((k) => !k.installed);

  return (
    <div className="space-y-6">
      <SectionTitle
        overline="skills"
        title={
          <>
            Skills = <span className="text-grad-cyan">HOW.</span>
          </>
        }
        sub="Packaged methods with declared scopes. An agent that holds the scope can use the skill; otherwise the gateway blocks it."
      />
      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <div className="font-mono text-[10px] tracking-widest mb-3" style={{ color: 'var(--ok)' }}>INSTALLED · {installed.length}</div>
          <div className="space-y-2">
            {installed.map((k) => (
              <GlassPanel key={k.id} className="p-4">
                <div className="flex items-center gap-2">
                  <Puzzle size={14} style={{ color: 'var(--acc2)' }} />
                  <span className="font-medium text-sm">{k.name}</span>
                  <span className="chip !text-[9px] ml-auto">v{k.version}</span>
                  <button onClick={() => toggleInstall(k.id)} className="btn-ghost !py-1 !px-2.5 text-[10px]">remove</button>
                </div>
                <div className="text-[11px] mt-2 leading-relaxed" style={{ color: 'var(--dim)' }}>{k.description}</div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {k.scopes.length ? k.scopes.map((sc) => <span key={sc} className="chip !text-[9px]" style={{ color: 'var(--acc)' }}>{sc}</span>) : <span className="chip !text-[9px]">no scopes</span>}
                  <span className="chip !text-[9px]">{k.license}</span>
                </div>
              </GlassPanel>
            ))}
          </div>
        </div>
        <div>
          <div className="font-mono text-[10px] tracking-widest mb-3" style={{ color: 'var(--dim)' }}>AVAILABLE · {available.length}</div>
          <div className="space-y-2">
            {available.map((k) => (
              <GlassPanel key={k.id} className="p-4 opacity-80">
                <div className="flex items-center gap-2">
                  <Puzzle size={14} style={{ color: 'var(--dim)' }} />
                  <span className="font-medium text-sm">{k.name}</span>
                  <span className="chip !text-[9px] ml-auto">v{k.version}</span>
                  <button onClick={() => toggleInstall(k.id)} className="btn-primary !py-1 !px-2.5 text-[10px]">install</button>
                </div>
                <div className="text-[11px] mt-2 leading-relaxed" style={{ color: 'var(--dim)' }}>{k.description}</div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {k.scopes.map((sc) => <span key={sc} className="chip !text-[9px]" style={{ color: 'var(--warn)' }}>requires: {sc}</span>)}
                </div>
              </GlassPanel>
            ))}
            {!available.length && <div className="text-xs" style={{ color: 'var(--dim)' }}>everything is installed — more arrive via the Marketplace.</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
