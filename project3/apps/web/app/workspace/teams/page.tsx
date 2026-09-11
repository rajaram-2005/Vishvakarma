'use client';
// Aetherion — Teams: orchestrator + members, live goal runs.

import React, { useState } from 'react';
import { Play, Users } from 'lucide-react';
import { useSutra } from '@/lib/store';
import { GlassPanel, SectionTitle, LogConsole } from '@/components/ui';
import { uid } from '@sutra/shared';

export default function TeamsPage() {
  const { s, mutate, act, trace } = useSutra();
  const [teamId, setTeamId] = useState(s.teams[0]?.id ?? '');
  const [goal, setGoal] = useState('Ship the MVP squad demo: plan, code, test, secure.');
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  const team = s.teams.find((t) => t.id === teamId);
  const orch = s.agents.find((a) => a.id === team?.orchestrator);

  const run = async () => {
    if (!team || !orch || running) return;
    setRunning(true);
    setLog([`▸ orchestrator: ${orch.name} takes the goal`, `  goal: "${goal.slice(0, 70)}"`]);
    const tr = trace(`team.${team.id}`);
    const t0 = Date.now();
    const lines: string[] = [`# Team report — ${team.name}`, `goal: ${goal}`, ''];
    for (const mid of team.members) {
      const m = s.agents.find((a) => a.id === mid);
      if (!m) continue;
      await new Promise((r) => setTimeout(r, 500));
      const contribution = teamMemberWork(m.id, goal);
      lines.push(`## ${m.name} (${m.role})`, ...contribution, '');
      setLog((l) => [...l, `▸ handoff → ${m.name}`, ...contribution.slice(0, 3).map((x) => `    ${x}`)]);
    }
    mutate((st) => ({ ...st, fs: { ...st.fs, [`reports/team-${team.id}-${uid('t')}.md`]: lines.join('\n') } }));
    setLog((l) => [...l, '✓ team report written to /reports', '✓ handoffs recorded in trace']);
    tr.span('team.run', Date.now() - t0, { members: String(team.members.length) });
    const id = tr.end();
    act('team', `${team.name} run complete`, goal.slice(0, 50), id);
    setRunning(false);
  };

  return (
    <div className="space-y-6">
      <SectionTitle
        overline="agent teams"
        title="Swarms of specialists, one orchestrator."
        sub="Pick a team, give it a goal. The orchestrator decomposes, delegates and verifies — every handoff is traced."
      />
      <div className="grid md:grid-cols-2 gap-4">
        {s.teams.map((t) => {
          const o = s.agents.find((a) => a.id === t.orchestrator);
          return (
            <button key={t.id} onClick={() => setTeamId(t.id)} className="glass glass-hover p-5 text-left" style={{ borderColor: teamId === t.id ? 'color-mix(in srgb, var(--acc) 50%, var(--line))' : 'var(--line)' }}>
              <div className="flex items-center gap-2 mb-2">
                <Users size={15} style={{ color: 'var(--acc2)' }} />
                <span className="font-display font-semibold">{t.name}</span>
                <span className="chip !text-[9px] ml-auto">{t.members.length} members</span>
              </div>
              <div className="text-xs mb-3" style={{ color: 'var(--dim)' }}>{t.goal}</div>
              <div className="flex flex-wrap gap-1.5">
                {t.members.map((m) => {
                  const a = s.agents.find((x) => x.id === m);
                  return a ? (
                    <span key={m} className="chip !text-[9px]">
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: a.color }} />
                      {a.name}
                      {m === t.orchestrator ? ' ★' : ''}
                    </span>
                  ) : null;
                })}
              </div>
            </button>
          );
        })}
      </div>
      <GlassPanel className="p-5">
        <div className="flex flex-col md:flex-row gap-3 mb-4">
          <input value={goal} onChange={(e) => setGoal(e.target.value)} className="glass-2 flex-1 px-4 py-3 text-sm outline-none" style={{ color: 'var(--ink)' }} placeholder="team goal…" />
          <button onClick={() => void run()} disabled={running} className="btn-primary self-start" style={{ opacity: running ? 0.5 : 1 }}>
            <Play size={14} /> {running ? 'Running…' : `Run ${team?.name ?? 'team'}`}
          </button>
        </div>
        <LogConsole lines={log.length ? log : ['idle — the orchestrator is waiting for a goal']} maxHeight={260} />
        {orch && <div className="mt-3 font-mono text-[10px]" style={{ color: 'var(--dim)' }}>orchestrator: {orch.name} · model: {orch.model}</div>}
      </GlassPanel>
    </div>
  );
}

function teamMemberWork(agentId: string, goal: string): string[] {
  const g = goal.slice(0, 48);
  switch (agentId) {
    case 'ag-architect':
      return [`architecture note drafted for "${g}"`, 'interfaces defined · zero new dependencies', 'handoff → coder'];
    case 'ag-coder':
      return ['implemented the smallest safe slice', '+22 −3 · workspace sandbox only', 'handoff → tester'];
    case 'ag-tester':
      return ['added 2 deterministic checks', 'result: PASS (0 failures)', 'handoff → security'];
    case 'ag-security':
      return ['secret scan: clean', 'risk: low — no approval required', 'handoff → orchestrator'];
    case 'ag-researcher':
      return [`grounded findings on "${g}"`, '3 sources cited', 'handoff → writer'];
    case 'ag-writer':
      return ['brief written with citations', 'handoff → orchestrator'];
    case 'ag-ops':
      return ['deploy bundle verified', 'target: local · health 200'];
    default:
      return ['done'];
  }
}
