'use client';
// Lumen — Projects: the AI-powered To-Do system (Puter KV or local),
// AI planning, and the developer IDE entry.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Archive,
  ArchiveRestore,
  ArrowDown,
  ArrowUp,
  Code2,
  ExternalLink,
  Plus,
  Sparkles,
  Trash2,
  Workflow as WorkflowIcon,
} from 'lucide-react';
import { useSutra } from '@/lib/store';
import { GlassPanel, Modal, SectionTitle, SearchBox, Toggle } from '@/components/ui';
import { planFromGoal, tasksToWorkflowNodes } from '@/lib/planner';
import { createKVStore } from '@sutra/puter-adapter';
import { uid, todayIso } from '@sutra/shared';
import type { SutraTask, Workflow } from '@sutra/shared';
import { IDE } from '@/components/workspace/IDE';
import { usePuter } from '@/lib/puter';

const PRIORITIES: Array<SutraTask['priority']> = ['p0', 'p1', 'p2', 'p3'];
const PRIORITIES_TONE: Record<string, string> = {
  p0: 'var(--bad)',
  p1: 'var(--warn)',
  p2: 'var(--acc2)',
  p3: 'var(--dim)',
};

export default function ProjectsPage() {
  const { s, mutate, act } = useSutra();
  const [selected, setSelected] = useState<string | null>(s.projects[0]?.id ?? null);
  const [tab, setTab] = useState<'tasks' | 'ide'>('tasks');

  const project = s.projects.find((p) => p.id === selected) ?? null;

  const createProject = () => {
    const name = window.prompt('Project name?', 'New project');
    if (!name) return;
    const id = uid('prj');
    mutate((st) => ({
      ...st,
      projects: [...st.projects, { id, name, description: '', template: 'blank', color: '#22d3ee', createdAt: new Date().toISOString() }],
      tasksByProject: { ...st.tasksByProject, [id]: st.tasksByProject[id] ?? [] },
    }));
    setSelected(id);
    act('project', `project created · ${name}`, 'template: blank');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <SectionTitle
          overline="projects"
          title="Your builds, your tasks, your code."
          sub="Each project owns a task system (Puter KV when connected, local otherwise) and a full developer IDE."
        />
        <button onClick={createProject} className="btn-primary !py-2 text-xs">
          <Plus size={13} /> New project
        </button>
      </div>

      <div className="flex flex-wrap gap-3">
        {s.projects.map((p) => (
          <button
            key={p.id}
            onClick={() => {
              setSelected(p.id);
              setTab('tasks');
            }}
            className="glass glass-hover p-4 text-left w-[220px]"
            style={{
              borderColor: selected === p.id ? 'color-mix(in srgb, var(--acc) 50%, var(--line))' : 'var(--line)',
              boxShadow: selected === p.id ? '0 0 26px -10px var(--glow-a)' : 'none',
            }}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2 h-2 rounded-full" style={{ background: p.color, boxShadow: `0 0 8px ${p.color}` }} />
              <span className="font-medium text-sm truncate">{p.name}</span>
            </div>
            <div className="font-mono text-[10px]" style={{ color: 'var(--dim)' }}>
              {(s.tasksByProject[p.id] ?? []).length} tasks · {(s.tasksByProject[p.id] ?? []).filter((t) => t.status === 'done').length} done
            </div>
          </button>
        ))}
      </div>

      {project && (
        <GlassPanel className="!rounded-[22px] overflow-hidden">
          <div className="flex items-center gap-2 px-5 pt-4">
            {(['tasks', 'ide'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className="px-4 py-2 rounded-t-lg text-xs font-mono tracking-wider uppercase"
                style={{
                  background: tab === t ? 'color-mix(in srgb, var(--acc) 12%, transparent)' : 'transparent',
                  color: tab === t ? 'var(--ink)' : 'var(--dim)',
                  borderBottom: `2px solid ${tab === t ? 'var(--acc2)' : 'transparent'}`,
                }}
              >
                {t === 'tasks' ? 'Tasks' : 'IDE'}
              </button>
            ))}
            <div className="flex-1" />
            <Link href="/workspace/deployments" className="chip hidden sm:inline-flex">
              <RocketMini /> deploy →
            </Link>
          </div>
          <div className="px-5 pb-5 pt-3 border-t" style={{ borderColor: 'var(--line)' }}>
            {tab === 'tasks' ? <TasksPanel projectId={project.id} projectName={project.name} /> : <IDE />}
          </div>
        </GlassPanel>
      )}
    </div>
  );
}

function RocketMini() {
  return <span className="inline-block w-1 h-1 rounded-full mr-1" style={{ background: 'var(--acc2)' }} />;
}

/* ================= Tasks (Puter KV To-Do) ================= */

function TasksPanel({ projectId, projectName }: { projectId: string; projectName: string }) {
  const { s, mutate, act, trace } = useSutra();
  const puter = usePuter();
  const kv = useMemo(() => createKVStore(), [puter.signedIn]);
  const key = `sutra:tasks:${projectId}`;

  const [tasks, setTasks] = useState<SutraTask[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [plan, setPlan] = useState<{ tasks: SutraTask[]; source: string } | null>(null);
  const [planning, setPlanning] = useState(false);
  const [goal, setGoal] = useState('Plan my Project 3 MVP.');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'open' | 'done'>('open');
  const [sortBy, setSortBy] = useState<'manual' | 'priority' | 'due'>('manual');
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<SutraTask | null>(null);
  const timer = useRef<number | null>(null);

  // load from KV (Puter or local)
  useEffect(() => {
    let on = true;
    setLoaded(false);
    void kv.get(key).then((raw) => {
      if (!on) return;
      let list: SutraTask[] = [];
      try {
        list = raw ? (JSON.parse(raw) as SutraTask[]) : (s.tasksByProject[projectId] ?? []);
      } catch {
        list = s.tasksByProject[projectId] ?? [];
      }
      setTasks(list);
      setLoaded(true);
    });
    return () => {
      on = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, kv.mode]);

  const persist = useCallback(
    (list: SutraTask[]) => {
      setTasks(list);
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        void kv.set(key, JSON.stringify(list));
        mutate((st) => ({ ...st, tasksByProject: { ...st.tasksByProject, [projectId]: list } }));
      }, 250);
    },
    [kv, key, mutate, projectId],
  );

  const runPlan = async () => {
    setPlanning(true);
    const tr = trace('plan.generate');
    const t0 = Date.now();
    const res = await planFromGoal(goal, s.models, s.settings);
    tr.span('planner.run', Date.now() - t0, { source: res.source, tasks: String(res.tasks.length) });
    const id = tr.end();
    setPlan({ tasks: res.tasks, source: res.source === 'llm' ? `LLM (${res.model})` : 'Lumen Local (offline template)' });
    setPlanning(false);
    act('plan', `plan generated · ${res.tasks.length} tasks`, `goal: ${goal.slice(0, 40)} · via ${res.source}`, id);
  };

  const acceptAll = () => {
    if (!plan) return;
    persist([...tasks, ...plan.tasks.map((t, i) => ({ ...t, order: tasks.length + i }))]);
    setPlan(null);
    act('tasks', `${plan.tasks.length} tasks accepted`, `project: ${projectName}`);
  };

  const acceptOne = (t: SutraTask) => {
    if (!plan) return;
    persist([...tasks, { ...t, order: tasks.length }]);
    setPlan({ ...plan, tasks: plan.tasks.filter((x) => x.id !== t.id) });
  };

  const toWorkflow = () => {
    const nodes = tasksToWorkflowNodes(tasks.slice(0, 12));
    if (!nodes.length) return;
    const id = uid('wf');
    const edges: Array<[string, string]> = [
      ['trig', 't0'],
      ...nodes.slice(0, -1).map((n, i) => [n.id, nodes[i + 1].id] as [string, string]),
    ];
    const wf: Workflow = {
      id,
      name: `${projectName} · generated`,
      description: 'Generated from the accepted task list.',
      trigger: 'manual',
      nodes: [
        { id: 'trig', type: 'trigger', label: 'Manual start', config: {} },
        ...nodes.map((n) => ({ id: n.id, type: n.type as string, label: n.label, config: n.config })),
      ],
      edges,
      updatedAt: new Date().toISOString(),
    };
    mutate((st) => ({ ...st, workflows: [wf, ...st.workflows] }));
    act('workflow', `workflow generated from ${tasks.length} tasks`, 'open Workflows to run or export to n8n');
  };

  const update = (id: string, patch: Partial<SutraTask>) => persist(tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  const remove = (id: string) => persist(tasks.filter((t) => t.id !== id));
  const move = (id: string, dir: -1 | 1) => {
    const sorted = tasks.filter((t) => !t.archived).sort((a, b) => a.order - b.order);
    const idx = sorted.findIndex((t) => t.id === id);
    const j = idx + dir;
    if (j < 0 || j >= sorted.length) return;
    const a = sorted[idx].order;
    const b = sorted[j].order;
    persist(tasks.map((t) => (t.id === sorted[idx].id ? { ...t, order: b } : t.id === sorted[j].id ? { ...t, order: a } : t)));
  };

  const visible = useMemo(() => {
    let list = tasks.filter((t) => (showArchived ? t.archived : !t.archived));
    if (filter === 'open') list = list.filter((t) => t.status !== 'done');
    if (filter === 'done') list = list.filter((t) => t.status === 'done');
    if (query) {
      const q = query.toLowerCase();
      list = list.filter((t) => t.title.toLowerCase().includes(q) || t.tags.some((x) => x.toLowerCase().includes(q)) || t.category.toLowerCase().includes(q));
    }
    if (sortBy === 'priority') list = [...list].sort((a, b) => a.priority.localeCompare(b.priority));
    if (sortBy === 'due') list = [...list].sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999'));
    return list.sort((a, b) => (sortBy === 'manual' ? a.order - b.order : 0));
  }, [tasks, filter, query, sortBy, showArchived]);

  const done = tasks.filter((t) => t.status === 'done' && !t.archived).length;

  return (
    <div className="space-y-5">
      {/* AI command */}
      <div className="glass-2 p-4">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="flex items-center gap-2 flex-1">
            <Sparkles size={15} style={{ color: 'var(--acc2)' }} />
            <input
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void runPlan()}
              className="flex-1 bg-transparent outline-none text-sm"
              style={{ color: 'var(--ink)' }}
              placeholder='AI command — e.g. "Plan my Project 3 MVP."'
            />
          </div>
          <button onClick={() => void runPlan()} disabled={planning} className="btn-primary !py-2 text-xs self-start">
            {planning ? 'Planning…' : 'Generate tasks'}
          </button>
        </div>
        <div className="mt-2 font-mono text-[9px] tracking-wider" style={{ color: 'var(--dim)' }}>
          natural language → structured tasks · edit, accept, reject, regenerate · assign to agents or humans
        </div>
      </div>

      {/* pending plan diff */}
      {plan && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="glass-2 p-4 border" style={{ borderColor: 'color-mix(in srgb, var(--acc2) 40%, var(--line))' }}>
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <span className="chip" style={{ color: 'var(--acc2)' }}>plan · {plan.tasks.length} tasks</span>
            <span className="text-[10px] font-mono" style={{ color: 'var(--dim)' }}>via {plan.source}</span>
            <div className="flex-1" />
            <button onClick={acceptAll} className="btn-primary !py-1.5 !px-3 text-[11px]">Accept all</button>
            <button onClick={() => void runPlan()} className="btn-ghost !py-1.5 !px-3 text-[11px]" disabled={planning}>Regenerate</button>
            <button onClick={() => setPlan(null)} className="btn-ghost !py-1.5 !px-3 text-[11px]">Reject</button>
          </div>
          <div className="space-y-1.5 max-h-[280px] overflow-y-auto">
            {plan.tasks.map((t) => (
              <div key={t.id} className="flex items-center gap-2 text-xs">
                <span className="chip !text-[9px] shrink-0" style={{ color: PRIORITIES_TONE[t.priority] }}>{t.priority}</span>
                <span className="truncate flex-1">{t.title}</span>
                <span className="chip !text-[9px] shrink-0 hidden sm:inline-flex">{t.category}</span>
                <span className="chip !text-[9px] shrink-0 hidden md:inline-flex">{t.assignee.name}</span>
                <button onClick={() => acceptOne(t)} className="chip risk-low !text-[9px] shrink-0" style={{ cursor: 'pointer' }}>accept</button>
                <button onClick={() => setPlan({ ...plan, tasks: plan.tasks.filter((x) => x.id !== t.id) })} className="chip !text-[9px] shrink-0" style={{ cursor: 'pointer' }}>✕</button>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-56">
          <SearchBox value={query} onChange={setQuery} placeholder="search tasks / tags / categories…" />
        </div>
        <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} className="glass-2 px-3 py-2 text-xs outline-none" style={{ color: 'var(--ink)' }}>
          <option value="open">open</option>
          <option value="done">done</option>
          <option value="all">all</option>
        </select>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)} className="glass-2 px-3 py-2 text-xs outline-none" style={{ color: 'var(--ink)' }}>
          <option value="manual">sort: manual</option>
          <option value="priority">sort: priority</option>
          <option value="due">sort: due date</option>
        </select>
        <Toggle on={showArchived} onChange={setShowArchived} label={showArchived ? 'showing archived' : 'archived'} />
        <div className="flex-1" />
        <button onClick={toWorkflow} disabled={!tasks.length} className="btn-ghost !py-2 !px-3 text-[11px]" style={{ opacity: tasks.length ? 1 : 0.4 }}>
          <WorkflowIcon size={13} /> Convert to workflow
        </button>
      </div>

      {/* list */}
      {!loaded ? (
        <div className="font-mono text-xs animate-pulse-soft" style={{ color: 'var(--dim)' }}>loading tasks from {kv.mode} store…</div>
      ) : visible.length === 0 ? (
        <div className="glass-2 p-8 text-center text-sm" style={{ color: 'var(--dim)' }}>
          {showArchived ? 'No archived tasks.' : 'No tasks yet — generate a plan above, or add one by hand.'}
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map((t) => (
            <div
              key={t.id}
              className="glass-2 p-3 flex items-start gap-3 group"
              style={{ opacity: t.status === 'done' ? 0.6 : 1, borderLeft: `2px solid ${PRIORITIES_TONE[t.priority]}` }}
            >
              <button
                onClick={() => update(t.id, { status: t.status === 'done' ? 'todo' : 'done' })}
                className="mt-0.5 w-4.5 h-4.5 w-[18px] h-[18px] rounded-md border flex items-center justify-center shrink-0"
                style={{
                  borderColor: t.status === 'done' ? 'var(--ok)' : 'var(--line)',
                  background: t.status === 'done' ? 'color-mix(in srgb, var(--ok) 25%, transparent)' : 'transparent',
                  color: 'var(--ok)',
                }}
                title={t.status === 'done' ? 'mark incomplete' : 'mark done'}
              >
                {t.status === 'done' && '✓'}
              </button>
              <div className="min-w-0 flex-1">
                <div className={`text-sm ${t.status === 'done' ? 'line-through' : ''}`}>{t.title}</div>
                {t.description && <div className="text-[11px] mt-0.5" style={{ color: 'var(--dim)' }}>{t.description}</div>}
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <span className="chip !text-[9px]" style={{ color: PRIORITIES_TONE[t.priority] }}>{t.priority}</span>
                  <span className="chip !text-[9px]">{t.category}</span>
                  {t.due && <span className="chip !text-[9px]" style={{ color: 'var(--warn)' }}>due {t.due}</span>}
                  {t.tags.map((tag) => (
                    <span key={tag} className="chip !text-[9px]" style={{ color: 'var(--acc2)' }}>#{tag}</span>
                  ))}
                  <span className="chip !text-[9px]">{t.assignee.kind === 'agent' ? '🤖 ' : ''}{t.assignee.name}</span>
                </div>
              </div>
              <div className="flex items-center gap-1 opacity-40 group-hover:opacity-100 transition-opacity shrink-0">
                <IconBtn title="move up" onClick={() => move(t.id, -1)}><ArrowUp size={12} /></IconBtn>
                <IconBtn title="move down" onClick={() => move(t.id, 1)}><ArrowDown size={12} /></IconBtn>
                <IconBtn title="edit" onClick={() => setEditing(t)}><Code2 size={12} /></IconBtn>
                <IconBtn title={t.archived ? 'restore' : 'archive'} onClick={() => update(t.id, { archived: !t.archived })}>
                  {t.archived ? <ArchiveRestore size={12} /> : <Archive size={12} />}
                </IconBtn>
                <IconBtn title="delete" onClick={() => remove(t.id)}><Trash2 size={12} /></IconBtn>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between font-mono text-[9px] tracking-wider" style={{ color: 'var(--dim)' }}>
        <span>
          stored in <span style={{ color: kv.mode === 'puter' ? 'var(--ok)' : 'var(--acc2)' }}>{kv.mode === 'puter' ? 'puter kv (cloud)' : 'local storage'}</span> · key {key}
        </span>
        <span>{done}/{tasks.filter((t) => !t.archived).length} done</span>
      </div>

      {/* edit modal */}
      <TaskEditModal
        task={editing}
        agents={s.agents}
        onClose={() => setEditing(null)}
        onSave={(t) => {
          update(t.id, t);
          setEditing(null);
        }}
      />
      <div className="text-[10px] font-mono" style={{ color: 'var(--dim)' }}>
        <a href="https://developer.puter.com" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:opacity-100" style={{ opacity: 0.8 }}>
          Powered by Puter <ExternalLink size={9} />
        </a>{' '}
        · local mode never forces authentication
      </div>
    </div>
  );
}

function IconBtn({ children, onClick, title }: { children: React.ReactNode; onClick: () => void; title: string }) {
  return (
    <button onClick={onClick} title={title} className="p-1.5 rounded-md hover:opacity-100" style={{ color: 'var(--dim)' }}>
      {children}
    </button>
  );
}

function TaskEditModal({
  task,
  agents,
  onClose,
  onSave,
}: {
  task: SutraTask | null;
  agents: Array<{ id: string; name: string }>;
  onClose: () => void;
  onSave: (t: SutraTask) => void;
}) {
  const [draft, setDraft] = useState<SutraTask | null>(null);
  useEffect(() => setDraft(task ? { ...task, tags: [...task.tags] } : null), [task]);
  if (!draft) return null;
  const set = (p: Partial<SutraTask>) => setDraft({ ...draft, ...p });
  return (
    <Modal open={!!task} onClose={onClose} title="Edit task" wide>
      <div className="grid md:grid-cols-2 gap-4">
        <div className="space-y-3">
          <Field label="title">
            <input value={draft.title} onChange={(e) => set({ title: e.target.value })} className="glass-2 w-full px-3 py-2 text-sm outline-none" style={{ color: 'var(--ink)' }} />
          </Field>
          <Field label="description">
            <textarea value={draft.description} onChange={(e) => set({ description: e.target.value })} rows={3} className="glass-2 w-full px-3 py-2 text-sm outline-none resize-none" style={{ color: 'var(--ink)' }} />
          </Field>
          <Field label="tags (comma separated)">
            <input value={draft.tags.join(', ')} onChange={(e) => set({ tags: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })} className="glass-2 w-full px-3 py-2 text-sm outline-none" style={{ color: 'var(--ink)' }} />
          </Field>
          <Field label="due date">
            <input type="date" value={draft.due ?? ''} onChange={(e) => set({ due: e.target.value || null })} className="glass-2 w-full px-3 py-2 text-sm outline-none" style={{ color: 'var(--ink)' }} />
          </Field>
        </div>
        <div className="space-y-3">
          <Field label="priority">
            <div className="flex gap-2">
              {PRIORITIES.map((p) => (
                <button key={p} onClick={() => set({ priority: p })} className="chip" style={{ color: draft.priority === p ? PRIORITIES_TONE[p] : 'var(--dim)', borderColor: draft.priority === p ? PRIORITIES_TONE[p] : 'var(--line)' }}>
                  {p}
                </button>
              ))}
            </div>
          </Field>
          <Field label="category">
            <input value={draft.category} onChange={(e) => set({ category: e.target.value })} className="glass-2 w-full px-3 py-2 text-sm outline-none" style={{ color: 'var(--ink)' }} />
          </Field>
          <Field label="assignee">
            <select
              value={`${draft.assignee.kind}:${draft.assignee.id}`}
              onChange={(e) => {
                const [kind, id] = e.target.value.split(':');
                const a = agents.find((x) => x.id === id);
                set({ assignee: { kind: kind as 'human' | 'agent', id, name: kind === 'human' ? 'You' : a?.name ?? id } });
              }}
              className="glass-2 w-full px-3 py-2 text-sm outline-none"
              style={{ color: 'var(--ink)' }}
            >
              <option value="human:human">You (human)</option>
              {agents.map((a) => (
                <option key={a.id} value={`agent:${a.id}`}>{a.name} (agent)</option>
              ))}
            </select>
          </Field>
          <Field label="status">
            <select value={draft.status} onChange={(e) => set({ status: e.target.value as SutraTask['status'] })} className="glass-2 w-full px-3 py-2 text-sm outline-none" style={{ color: 'var(--ink)' }}>
              <option value="todo">todo</option>
              <option value="doing">doing</option>
              <option value="done">done</option>
            </select>
          </Field>
          <div className="flex gap-3 pt-2">
            <button onClick={() => onSave(draft)} className="btn-primary !py-2 text-xs">Save task</button>
            <button onClick={onClose} className="btn-ghost !py-2 text-xs">Cancel</button>
          </div>
          <div className="font-mono text-[9px]" style={{ color: 'var(--dim)' }}>
            today: {todayIso()}
          </div>
        </div>
      </div>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="font-mono text-[9px] tracking-widest mb-1.5" style={{ color: 'var(--dim)' }}>{label.toUpperCase()}</div>
      {children}
    </div>
  );
}
