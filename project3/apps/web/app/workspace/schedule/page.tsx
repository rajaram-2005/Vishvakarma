'use client';
// Aetherion — Schedule. One of the six major things: recurring tasks that
// run through the embedded Aetheris core (agent prompts or workflows),
// with cron presets, timezones, run history and email/webhook delivery.

import React, { useCallback, useEffect, useState } from 'react';
import { AlarmClock, CalendarDays, Clock, Play, Plus, Power, RefreshCw, Trash2, Zap } from 'lucide-react';
import { GlassPanel } from '@/components/ui';
import { useSutra } from '@/lib/store';

interface ScheduleItem {
  id: string; name: string; enabled: boolean; cron: string; tz: string;
  task: { kind: 'workflow'; workflowId: string; input: string } | { kind: 'agent'; agent: string; prompt: string };
  human?: string;
  nextAt: number | null; lastAt?: number; lastStatus?: 'ok' | 'error'; lastError?: string; runs: number;
}
interface RunItem {
  id: string; scheduleId: string; startedAt: number; finishedAt?: number;
  status: 'running' | 'ok' | 'error'; output: string; error?: string; trigger: 'cron' | 'manual';
}
interface AgentItem { id: string; name: string; domain: string; description: string }
interface WorkflowItem { id: string; name: string; inputLabel: string }

interface SchedulesData {
  schedules: ScheduleItem[]; runs: RunItem[];
  presets: { label: string; cron: string }[];
  workflows: WorkflowItem[]; limits: { perUser: number; minIntervalMinutes: number; runsKept: number };
  email: boolean; cronSecretSet: boolean;
}

const fmtTime = (t: number | null | undefined) => (t ? new Date(t).toLocaleString() : '—');

export default function SchedulePage() {
  const { act } = useSutra();
  const [data, setData] = useState<SchedulesData | null>(null);
  const [agents, setAgents] = useState<AgentItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState('');
  const [cron, setCron] = useState('0 8 * * *');
  const [tz, setTz] = useState(typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC');
  const [taskKind, setTaskKind] = useState<'agent' | 'workflow'>('agent');
  const [agent, setAgent] = useState('prime');
  const [prompt, setPrompt] = useState('');
  const [workflowId, setWorkflowId] = useState('');
  const [workflowInput, setWorkflowInput] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/schedules', { cache: 'no-store' });
      if (!res.ok) throw new Error(`schedules: HTTP ${res.status}`);
      setData(await res.json());
      setError(null);
    } catch (e) {
      setError(String((e as Error).message ?? e));
    }
  }, []);

  useEffect(() => {
    void load();
    fetch('/api/agents', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => setAgents((j.agents ?? []) as AgentItem[]))
      .catch(() => {});
  }, [load]);

  useEffect(() => {
    if (taskKind === 'workflow' && !workflowId && (data?.workflows.length ?? 0) > 0) {
      setWorkflowId(data!.workflows[0].id);
    }
  }, [taskKind, workflowId, data]);

  const create = async () => {
    if (!name.trim() || !cron.trim()) return;
    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        name: name.trim(), cron: cron.trim(), tz, enabled: true, deliver: [],
        task:
          taskKind === 'agent'
            ? { kind: 'agent', agent, prompt: prompt.trim() }
            : { kind: 'workflow', workflowId, input: workflowInput.trim() },
      };
      const res = await fetch('/api/schedules', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      setName(''); setPrompt(''); setWorkflowInput('');
      act('schedule', 'schedule created', `${j.schedule.name} · ${j.schedule.human}`, undefined);
      await load();
    } catch (e) {
      setError(String((e as Error).message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (s: ScheduleItem) => {
    const res = await fetch(`/api/schedules/${s.id}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enabled: !s.enabled }),
    });
    if (!res.ok) { setError(`toggle failed: HTTP ${res.status}`); return; }
    await load();
  };

  const remove = async (s: ScheduleItem) => {
    const res = await fetch(`/api/schedules/${s.id}`, { method: 'DELETE' });
    if (!res.ok) { setError(`delete failed: HTTP ${res.status}`); return; }
    act('schedule', 'schedule deleted', s.name, undefined);
    await load();
  };

  const tick = async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/schedules/tick', { method: 'POST' });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      act('schedule', 'due schedules run', `ran=${j.ran ?? 'ok'}`, undefined);
      await load();
    } catch (e) {
      setError(String((e as Error).message ?? e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="overline mb-2">schedule</div>
        <div className="display-1">Time is a feature<span className="text-grad">.</span></div>
        <div className="text-sm mt-2 max-w-2xl leading-relaxed" style={{ color: 'var(--dim)' }}>
          Recurring tasks that run through the embedded intelligence core — daily digests, agent prompts, workflow runs — with cron presets, timezones, run history and delivery hooks.
        </div>
      </div>

      {error && (
        <div className="glass p-3 font-mono text-[11px]" style={{ color: 'var(--warn)', borderColor: 'color-mix(in srgb, var(--warn) 40%, var(--line))' }}>
          ⚠ {error}
        </div>
      )}

      <div className="grid lg:grid-cols-[1fr_340px] gap-5">
        <div className="space-y-5">
          {/* schedules */}
          <GlassPanel className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="font-mono text-[10px] tracking-widest" style={{ color: 'var(--acc2)' }}>
                SCHEDULES {data ? `· ${data.schedules.length}/${data.limits.perUser}` : ''}
              </div>
              <div className="flex gap-2">
                <button onClick={() => void tick()} disabled={busy} className="btn-ghost !py-2 !px-3 text-xs disabled:opacity-50">
                  <Play size={12} /> run due now
                </button>
                <button onClick={() => void load()} className="btn-ghost !py-2 !px-3 text-xs">
                  <RefreshCw size={12} /> refresh
                </button>
              </div>
            </div>
            {!data ? (
              <div className="text-xs" style={{ color: 'var(--dim)' }}>Loading schedules…</div>
            ) : data.schedules.length === 0 ? (
              <div className="text-xs leading-relaxed" style={{ color: 'var(--dim)' }}>
                No schedules yet — create one on the right. They are stored by the embedded core and run on its tick endpoint (wire /api/schedules/tick to an external cron, or press “run due now”).
              </div>
            ) : (
              <div className="space-y-2.5">
                {data.schedules.map((s) => (
                  <div key={s.id} className="glass-2 rounded-xl p-3.5">
                    <div className="flex items-center gap-3">
                      <span className="grid place-items-center w-8 h-8 rounded-lg shrink-0" style={{ background: 'color-mix(in srgb, var(--acc2) 18%, transparent)', color: 'var(--acc2)' }}>
                        <Clock size={14} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-semibold truncate" style={{ color: 'var(--ink)' }}>{s.name}</div>
                        <div className="text-[10px] font-mono truncate" style={{ color: 'var(--dim)' }}>
                          {s.human ?? s.cron} · {s.tz} · next {fmtTime(s.nextAt)}
                        </div>
                      </div>
                      <span className="chip !text-[9px]" style={{ color: s.lastStatus === 'error' ? 'var(--bad)' : s.lastStatus === 'ok' ? 'var(--ok)' : 'var(--dim)' }}>
                        {s.runs} run{s.runs === 1 ? '' : 's'}{s.lastStatus ? ` · last ${s.lastStatus}` : ''}
                      </span>
                      <button onClick={() => void toggle(s)} title={s.enabled ? 'disable' : 'enable'} className="p-1.5 rounded-lg transition-colors" style={{ color: s.enabled ? 'var(--ok)' : 'var(--dim)' }}>
                        <Power size={14} />
                      </button>
                      <button onClick={() => void remove(s)} title="delete" className="p-1.5 rounded-lg transition-colors" style={{ color: 'var(--dim)' }}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                    {s.task.kind === 'agent' && (
                      <div className="mt-2 text-[10px] font-mono truncate" style={{ color: 'var(--dim)' }}>
                        agent: {s.task.agent} → “{s.task.prompt.slice(0, 80)}”
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            <div className="mt-3 text-[10px] font-mono" style={{ color: 'var(--dim)' }}>
              {data && `min interval ${data.limits.minIntervalMinutes}m · ${data.limits.runsKept} runs kept · cron secret ${data.cronSecretSet ? 'set' : 'open (self-host)'} · email ${data.email ? 'configured' : 'not configured'}`}
            </div>
          </GlassPanel>

          {/* run history */}
          <GlassPanel className="p-5">
            <div className="font-mono text-[10px] tracking-widest mb-3" style={{ color: 'var(--acc2)' }}>
              RECENT RUNS {data ? `· ${data.runs.length}` : ''}
            </div>
            {!data || data.runs.length === 0 ? (
              <div className="text-xs" style={{ color: 'var(--dim)' }}>No runs yet.</div>
            ) : (
              <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                {data.runs.slice(0, 12).map((r) => (
                  <div key={r.id} className="glass-2 rounded-lg p-3">
                    <div className="flex items-center gap-2 text-[10px] font-mono" style={{ color: 'var(--dim)' }}>
                      <span style={{ color: r.status === 'ok' ? 'var(--ok)' : r.status === 'error' ? 'var(--bad)' : 'var(--warn)' }}>{r.status}</span>
                      <span>{fmtTime(r.startedAt)}</span>
                      <span className="ml-auto">{r.trigger}</span>
                    </div>
                    {r.output && <div className="mt-1.5 text-[11px] leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--dim)' }}>{r.output.slice(0, 220)}</div>}
                  </div>
                ))}
              </div>
            )}
          </GlassPanel>
        </div>

        {/* create */}
        <GlassPanel className="p-5 h-fit lg:sticky lg:top-16 space-y-4">
          <div className="font-mono text-[10px] tracking-widest" style={{ color: 'var(--acc2)' }}>NEW SCHEDULE</div>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="name (e.g. Morning digest)" className="glass-2 w-full px-3 py-2.5 text-sm outline-none" style={{ color: 'var(--ink)' }} />

          <div>
            <div className="text-[10px] font-mono tracking-widest mb-1.5" style={{ color: 'var(--dim)' }}>PRESETS</div>
            <div className="flex flex-wrap gap-1.5">
              {(data?.presets ?? []).map((p) => (
                <button key={p.label} onClick={() => setCron(p.cron)} className="chip hover:opacity-100 !text-[9px]" style={{ opacity: cron === p.cron ? 1 : 0.7, borderColor: cron === p.cron ? 'var(--acc2)' : undefined, color: cron === p.cron ? 'var(--acc2)' : undefined }}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="text-[10px] font-mono tracking-widest mb-1.5" style={{ color: 'var(--dim)' }}>CRON</div>
              <input value={cron} onChange={(e) => setCron(e.target.value)} className="glass-2 w-full px-3 py-2.5 text-xs font-mono outline-none" style={{ color: 'var(--ink)' }} />
            </div>
            <div>
              <div className="text-[10px] font-mono tracking-widest mb-1.5" style={{ color: 'var(--dim)' }}>TIMEZONE</div>
              <input value={tz} onChange={(e) => setTz(e.target.value)} className="glass-2 w-full px-3 py-2.5 text-xs font-mono outline-none" style={{ color: 'var(--ink)' }} />
            </div>
          </div>

          <div>
            <div className="text-[10px] font-mono tracking-widest mb-1.5" style={{ color: 'var(--dim)' }}>TASK</div>
            <div className="flex gap-1.5 mb-2">
              <button onClick={() => setTaskKind('agent')} className="chip hover:opacity-100 !text-[9px]" style={{ color: taskKind === 'agent' ? 'var(--acc2)' : undefined, borderColor: taskKind === 'agent' ? 'var(--acc2)' : undefined }}>agent prompt</button>
              <button onClick={() => setTaskKind('workflow')} className="chip hover:opacity-100 !text-[9px]" style={{ color: taskKind === 'workflow' ? 'var(--acc2)' : undefined, borderColor: taskKind === 'workflow' ? 'var(--acc2)' : undefined }}>workflow</button>
            </div>
            {taskKind === 'agent' ? (
              <>
                <select value={agent} onChange={(e) => setAgent(e.target.value)} className="glass-2 w-full px-3 py-2.5 text-xs outline-none mb-2" style={{ color: 'var(--ink)' }}>
                  {(agents.length ? agents : [{ id: 'prime', name: 'Prime (planner)', domain: 'orchestration', description: 'default planner' }]).map((a) => (
                    <option key={a.id} value={a.id}>{a.name} — {a.domain}</option>
                  ))}
                </select>
                <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} placeholder="prompt to run each time…" className="glass-2 w-full px-3 py-2.5 text-sm outline-none resize-y" style={{ color: 'var(--ink)' }} />
              </>
            ) : (
              <>
                <select value={workflowId} onChange={(e) => setWorkflowId(e.target.value)} className="glass-2 w-full px-3 py-2.5 text-xs outline-none mb-2" style={{ color: 'var(--ink)' }}>
                  {(data?.workflows ?? []).map((w) => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                  {(data?.workflows.length ?? 0) === 0 && <option value="">no workflows yet</option>}
                </select>
                <input value={workflowInput} onChange={(e) => setWorkflowInput(e.target.value)} placeholder="input for the workflow" className="glass-2 w-full px-3 py-2.5 text-xs outline-none" style={{ color: 'var(--ink)' }} />
              </>
            )}
          </div>

          <button onClick={() => void create()} disabled={busy || !name.trim() || !cron.trim()} className="btn-primary w-full justify-center disabled:opacity-50">
            <Plus size={14} /> create schedule
          </button>
        </GlassPanel>
      </div>
    </div>
  );
}
