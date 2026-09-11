'use client';
// Aetherion — Deployments: local · docker · puter cloud, with real artifacts.

import React, { useState } from 'react';
import { Container, Globe, Rocket } from 'lucide-react';
import { useSutra } from '@/lib/store';
import { GlassPanel, SectionTitle, LogConsole } from '@/components/ui';
import { runDeployment } from '@/lib/deploy';
import { uid, timeAgo } from '@sutra/shared';
import { usePuter } from '@/lib/puter';
import type { DeployStep } from '@/lib/deploy';

export default function DeploymentsPage() {
  const { s, mutate, act, trace } = useSutra();
  const puter = usePuter();
  const [target, setTarget] = useState<'local' | 'docker' | 'puter'>('local');
  const [running, setRunning] = useState(false);
  const [liveLog, setLiveLog] = useState<string[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);

  const deploy = async () => {
    if (running) return;
    setRunning(true);
    setLiveLog([`▸ deploy → ${target}`]);
    const tr = trace(`deploy.${target}`);
    const onStep = (st: DeployStep) => {
      setLiveLog((l) => [...l, `  ${st.ok ? '✓' : '✗'} ${st.name} → ${st.detail} (${st.ms}ms)`]);
      tr.span(`deploy.${st.name.toLowerCase()}`, st.ms, {}, st.ok ? 'ok' : 'error');
    };
    const out = await runDeployment(target, s.fs, onStep);
    const id = tr.end(out.ok ? 'ok' : 'error');
    mutate((st) => ({
      ...st,
      deployments: [
        {
          id: uid('dep'),
          name: `workspace → ${target}`,
          target,
          status: out.ok ? 'success' : 'failed',
          createdAt: new Date().toISOString(),
          url: out.url,
          log: out.steps.map((x) => `${x.ok ? '✓' : '✗'} ${x.name}: ${x.detail}`),
        },
        ...st.deployments,
      ],
    }));
    act('deploy', `deployed to ${target}`, out.url ?? 'failed', id);
    if (out.dockerfile) setLiveLog((l) => [...l, '', 'Dockerfile generated:']);
    setRunning(false);
  };

  const dockerfile = s.deployments.find((d) => d.target === 'docker')?.log;

  return (
    <div className="space-y-6">
      <SectionTitle
        overline="deployments"
        title="Ship with receipts."
        sub="Validate → checks → secret scan → bundle → target → health. A bundle with secret patterns never ships. Puter targets only write when you are signed in — local mode is never forced."
      />
      <GlassPanel className="p-5">
        <div className="flex flex-col md:flex-row gap-3 md:items-center">
          <div className="flex gap-2">
            {([
              ['local', 'Local', Rocket],
              ['docker', 'Docker', Container],
              ['puter', 'Puter Cloud', Globe],
            ] as const).map(([t, label, Icon]) => (
              <button
                key={t}
                onClick={() => setTarget(t)}
                className="btn-ghost !py-2 !px-4 text-xs"
                style={
                  target === t
                    ? { borderColor: 'var(--acc2)', color: 'var(--ink)', boxShadow: '0 0 18px -6px var(--glow-b)' }
                    : { opacity: 0.6 }
                }
              >
                <Icon size={13} /> {label}
              </button>
            ))}
          </div>
          <div className="flex-1" />
          <button onClick={() => void deploy()} disabled={running} className="btn-primary" style={{ opacity: running ? 0.5 : 1 }}>
            <Rocket size={14} /> {running ? 'Deploying…' : 'Deploy workspace'}
          </button>
        </div>
        {target === 'puter' && (
          <div className="mt-3 text-xs" style={{ color: puter.signedIn ? 'var(--ok)' : 'var(--dim)' }}>
            {puter.signedIn ? `Puter signed in as ${puter.user ?? 'you'} — bundle will be written to /aetherion/deployments/` : 'Puter is not signed in (local mode). The bundle stays local; connect Puter in Settings to enable the cloud target.'}
          </div>
        )}
        <div className="mt-4">
          <LogConsole lines={liveLog.length ? liveLog : ['deploy log appears here']} maxHeight={220} />
        </div>
      </GlassPanel>

      <div className="space-y-2">
        {s.deployments.map((d) => (
          <GlassPanel key={d.id} className="p-4">
            <div className="flex flex-wrap items-center gap-3">
              <span
                className="w-2 h-2 rounded-full"
                style={{ background: d.status === 'success' ? 'var(--ok)' : 'var(--bad)', boxShadow: `0 0 8px ${d.status === 'success' ? 'var(--ok)' : 'var(--bad)'}` }}
              />
              <span className="font-medium text-sm">{d.name}</span>
              <span className="chip !text-[9px]">{d.target}</span>
              {d.url && <span className="font-mono text-[10px] truncate" style={{ color: 'var(--acc2)' }}>{d.url}</span>}
              <button onClick={() => setOpenId(openId === d.id ? null : d.id)} className="chip !text-[9px] ml-auto" style={{ cursor: 'pointer' }}>
                {openId === d.id ? 'hide log' : 'log'}
              </button>
              <span className="font-mono text-[10px]" style={{ color: 'var(--dim)' }}>{timeAgo(d.createdAt)}</span>
            </div>
            {openId === d.id && (
              <div className="mt-3">
                <LogConsole lines={d.log} maxHeight={180} />
                {d.target === 'docker' && dockerfile && (
                  <div className="mt-2 font-mono text-[9px]" style={{ color: 'var(--dim)' }}>
                    (Dockerfile + compose generated with the bundle — see the deploy log)
                  </div>
                )}
              </div>
            )}
          </GlassPanel>
        ))}
        {!s.deployments.length && (
          <div className="glass p-8 text-center text-sm" style={{ color: 'var(--dim)' }}>
            no deployments yet — run the first one above.
          </div>
        )}
      </div>
    </div>
  );
}
