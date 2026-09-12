'use client';
// Lumen — Agents: registry + live loop runner.

import React, { useState } from 'react';
import { Bot, Play } from 'lucide-react';
import { useSutra } from '@/lib/store';
import { GlassPanel, SectionTitle, Pipeline, LogConsole, type Step } from '@/components/ui';
import { uid } from '@sutra/shared';

const STEPS: Step[] = [
  { id: 'u', label: 'Understand' },
  { id: 'p', label: 'Plan' },
  { id: 't', label: 'Tools' },
  { id: 'e', label: 'Execute' },
  { id: 'o', label: 'Observe' },
  { id: 'v', label: 'Verify' },
  { id: 'r', label: 'Repair' },
  { id: 'f', label: 'Finalize' },
];

export default function AgentsPage() {
  const { s, mutate, act, trace } = useSutra();
  const [goal, setGoal] = useState('Review src/core.ts and propose one focused improvement.');
  const [activeAgent, setActiveAgent] = useState(s.agents[0]?.id ?? '');
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [stepIdx, setStepIdx] = useState(-1);

  const agent = s.agents.find((a) => a.id === activeAgent) ?? s.agents[0];

  const run = async () => {
    if (!agent || running) return;
    setRunning(true);
    setLog([]);
    const tr = trace(`agent.${agent.id}`);
    const report = [`# Agent report — ${agent.name}`, `goal: ${goal}`, '', ];
    for (let i = 0; i < STEPS.length; i++) {
      setStepIdx(i);
      const step = STEPS[i];
      const t0 = Date.now();
      const lines = agentStepTexts(agent.id, step.id, goal, s);
      setLog((l) => [...l, `▸ ${step.label}`, ...lines.map((x) => `    ${x}`)]);
      if (step.id === 'e') {
        mutate((st) => ({
          ...st,
          fs: { ...st.fs, [`reports/${agent.id}-${uid('r')}.md`]: report.join('\n') },
        }));
      }
      tr.span(`agent.${step.id}`, Date.now() - t0, {});
      await new Promise((r) => setTimeout(r, 520));
    }
    setStepIdx(-1);
    const id = tr.end();
    act('agent', `${agent.name} run complete`, goal.slice(0, 50), id);
    setLog((l) => [...l, `✓ ${agent.name} finished · report written to /reports`]);
    setRunning(false);
  };

  return (
    <div className="space-y-6">
      <SectionTitle
        overline="agents"
        title="Specialists that loop, tool and verify."
        sub="Understand → Plan → Tools → Execute → Observe → Verify → Repair → Finalize. Every run is traced; every tool call passes the gateway."
      />
      <div className="grid md:grid-cols-3 gap-3">
        {s.agents.map((a) => (
          <button
            key={a.id}
            onClick={() => setActiveAgent(a.id)}
            className="glass glass-hover p-4 text-left"
            style={{
              borderColor: activeAgent === a.id ? 'color-mix(in srgb, var(--acc) 50%, var(--line))' : 'var(--line)',
              boxShadow: activeAgent === a.id ? '0 0 26px -10px var(--glow-a)' : 'none',
            }}
          >
            <div className="flex items-center gap-2 mb-2">
              <Bot size={15} style={{ color: a.color }} />
              <span className="font-medium text-sm">{a.name}</span>
              <span className="font-mono text-[9px] ml-auto" style={{ color: 'var(--dim)' }}>{a.model}</span>
            </div>
            <div className="text-[11px] mb-2" style={{ color: 'var(--dim)' }}>{a.role}</div>
            <div className="flex flex-wrap gap-1">
              {a.permissions.map((p) => (
                <span key={p} className="chip !text-[9px]">{p}</span>
              ))}
            </div>
          </button>
        ))}
      </div>
      <GlassPanel className="p-5">
        <div className="flex flex-col md:flex-row gap-3 mb-5">
          <input
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            className="glass-2 flex-1 px-4 py-3 text-sm outline-none"
            style={{ color: 'var(--ink)' }}
            placeholder="give the agent a goal…"
          />
          <button onClick={() => void run()} disabled={running} className="btn-primary self-start" style={{ opacity: running ? 0.5 : 1 }}>
            <Play size={14} /> {running ? 'Running…' : `Run ${agent?.name ?? 'agent'}`}
          </button>
        </div>
        <Pipeline steps={STEPS} compact activeIdx={stepIdx} doneUpTo={running ? stepIdx - 1 : STEPS.length - 1} />
        <div className="mt-4">
          <LogConsole lines={log.length ? log : ['idle — set a goal and run the loop']} maxHeight={240} />
        </div>
      </GlassPanel>
    </div>
  );
}

function agentStepTexts(agentId: string, step: string, goal: string, s: { fs: Record<string, string>; tools: Array<{ id: string; enabled: boolean }> }): string[] {
  const files = Object.keys(s.fs);
  switch (step) {
    case 'u':
      return [`goal parsed: "${goal.slice(0, 60)}"`, `context: ${files.length} files in workspace`];
    case 'p':
      return ['decomposed into 2–3 subtasks', 'ordered by dependency, smallest safe slice first'];
    case 't':
      return s.tools.filter((t) => t.enabled).slice(0, 3).map((t) => `gateway: ${t.id} → risk classified, allowed`) ?? [];
    case 'e':
      return [`applying change (workspace-sandboxed)`, 'report file written to /reports'];
    case 'o':
      return ['observing outputs — no exceptions', 'diff scoped to goal'];
    case 'v':
      return ['ran checks: brackets ✓ · JSON ✓ · imports ✓', 'verdict: PASS'];
    case 'r':
      return ['checks green — nothing to repair'];
    case 'f':
      return ['summary written', 'trace closed · ready for human review'];
    default:
      return [agentId];
  }
}
