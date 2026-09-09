'use client';
// SUTRA workspace — Home: core status, stats, quick actions, activity.

import React from 'react';
import Link from 'next/link';
import { ArrowRight, Bot, Database, Rocket, Sparkles } from 'lucide-react';
import { useSutra } from '@/lib/store';
import { Stat, GlassPanel, SectionTitle } from '@/components/ui';
import { UniverseCanvas } from '@/components/canvas/Universe';
import { reachableModels } from '@/lib/providers';
import { timeAgo } from '@sutra/shared';

export default function WorkspaceHome() {
  const { s } = useSutra();
  const tasks = Object.values(s.tasksByProject).reduce((a, t) => a + t.filter((x) => !x.archived).length, 0);
  const done = Object.values(s.tasksByProject).reduce((a, t) => a + t.filter((x) => x.status === 'done').length, 0);
  const online = reachableModels(s.models, s.settings).length;
  const pending = s.approvals.filter((a) => a.status === 'pending').length;

  return (
    <div className="space-y-8">
      <SectionTitle
        overline="home"
        title={
          <>
            The core is <span className="text-grad-cyan">online.</span>
          </>
        }
        sub="Local-first, every capability offline-capable. This is your operating console for the whole ecosystem."
      />

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Stat label="projects" value={s.projects.length} sub={s.projects[0]?.name.slice(0, 22)} tone="acc" />
        <Stat label="tasks" value={tasks} sub={`${done} done`} tone="acc2" />
        <Stat label="agents" value={s.agents.length} sub={`${s.teams.length} teams`} tone="acc" />
        <Stat label="models online" value={online} sub={`${s.models.length} registered`} tone="ok" />
        <Stat label="knowledge" value={s.chunks.length} sub={`${s.knowledge.length} documents`} tone="acc2" />
        <Stat label="approvals" value={pending} sub={pending ? 'waiting for you' : 'all clear'} tone={pending ? 'warn' : 'ok'} />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <GlassPanel className="relative overflow-hidden !rounded-[22px] lg:col-span-2">
          <div className="absolute inset-0">
            <UniverseCanvas mode="core" intensity={0.55} parallax={false} />
          </div>
          <div className="relative z-10 p-6 h-full flex flex-col justify-end min-h-[240px] pointer-events-none">
            <div className="font-mono text-[10px] tracking-widest mb-1" style={{ color: 'var(--acc2)' }}>SUTRA CORE</div>
            <div className="text-sm" style={{ color: 'var(--dim)' }}>
              {s.settings.privacyMode} mode · sync: {s.settings.syncScope} · {online} reachable models · Sutra Local always on
            </div>
          </div>
        </GlassPanel>

        <GlassPanel className="p-5">
          <div className="font-mono text-[10px] tracking-widest mb-4" style={{ color: 'var(--acc2)' }}>QUICK ACTIONS</div>
          <div className="space-y-2.5">
            {[
              [Sparkles, 'Plan my Project 3 MVP', '/workspace/projects', 'AI task planning'],
              [Bot, 'Run the agent loop', '/workspace/agents', 'Understand → Finalize'],
              [Database, 'Ask the knowledge base', '/workspace/knowledge', 'grounded + cited'],
              [Rocket, 'Deploy the workspace', '/workspace/deployments', 'local · docker · puter'],
            ].map(([Icon, label, href, sub]) => {
              const I = Icon as React.ComponentType<{ size?: number | string; style?: React.CSSProperties }>;
              return (
                <Link key={String(href)} href={String(href)} className="glass-2 glass-hover p-3 flex items-center gap-3">
                  <I size={15} style={{ color: 'var(--acc2)' }} />
                  <div className="min-w-0">
                    <div className="text-xs font-medium truncate">{String(label)}</div>
                    <div className="text-[10px]" style={{ color: 'var(--dim)' }}>{String(sub)}</div>
                  </div>
                  <ArrowRight size={13} className="ml-auto shrink-0" style={{ color: 'var(--dim)' }} />
                </Link>
              );
            })}
          </div>
        </GlassPanel>
      </div>

      <GlassPanel className="p-5">
        <div className="font-mono text-[10px] tracking-widest mb-4" style={{ color: 'var(--acc2)' }}>RECENT ACTIVITY</div>
        {s.activity.length === 0 && <div className="text-sm" style={{ color: 'var(--dim)' }}>quiet so far — do something.</div>}
        <div className="space-y-2">
          {s.activity.slice(0, 8).map((a) => (
            <div key={a.id} className="flex items-start gap-3 text-xs">
              <span className="chip shrink-0 !text-[9px] mt-0.5">{a.kind}</span>
              <div className="min-w-0">
                <span className="font-medium">{a.title}</span>
                <span className="ml-2" style={{ color: 'var(--dim)' }}>{a.detail}</span>
              </div>
              <span className="ml-auto font-mono text-[10px] shrink-0" style={{ color: 'var(--dim)' }}>{timeAgo(a.ts)}</span>
            </div>
          ))}
        </div>
      </GlassPanel>
    </div>
  );
}
