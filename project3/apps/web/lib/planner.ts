// Lumen — natural-language → structured task planning.
// Uses a connected model when reachable; otherwise the built-in local planner.
// Never blocks: users can accept/reject/regenerate each suggestion.

import type { SutraTask } from '@sutra/shared';
import { todayIso, uid } from '@sutra/shared';
import { providerFor, reachableModels } from './providers';
import type { ModelInfo, Settings } from '@sutra/shared';

const AGENTS: Record<string, { kind: 'human' | 'agent'; id: string; name: string }> = {
  architect: { kind: 'agent', id: 'ag-architect', name: 'Architect' },
  coder: { kind: 'agent', id: 'ag-coder', name: 'Coder' },
  tester: { kind: 'agent', id: 'ag-tester', name: 'Tester' },
  security: { kind: 'agent', id: 'ag-security', name: 'Sentinel' },
  writer: { kind: 'agent', id: 'ag-writer', name: 'Scribe' },
  ops: { kind: 'agent', id: 'ag-ops', name: 'Ops' },
  human: { kind: 'human', id: 'human', name: 'You' },
};

function mkTask(
  partial: Partial<SutraTask> & { title: string },
  i: number,
): SutraTask {
  return {
    id: uid('task'),
    description: '',
    priority: 'p1',
    category: 'Core',
    tags: [],
    due: null,
    assignee: { kind: 'human', id: 'human', name: 'You' },
    status: 'todo',
    archived: false,
    order: i,
    createdAt: new Date().toISOString(),
    ...partial,
  };
}

function localPlan(goal: string): SutraTask[] {
  const subject = /\bplan\b/.test(goal) ? 'Lumen MVP' : goal.replace(/^plan\b/i, '').trim() || 'the project';
  const due = (d: number) => todayIso(d);
  const rows: Array<Partial<SutraTask> & { title: string }> = [
    { title: `Define success metric for ${subject}`, description: 'One measurable outcome that tells us the MVP worked.', priority: 'p0', category: 'Discovery', tags: ['spec'], due: due(1), assignee: AGENTS.human },
    { title: 'Write one-page product spec', description: 'Problem, users, core loop, out-of-scope list.', priority: 'p0', category: 'Discovery', tags: ['spec'], due: due(1), assignee: AGENTS.writer },
    { title: 'Scaffold repository + CI', description: 'Next.js app, tests, lint, preview deploy. Local-first defaults.', priority: 'p0', category: 'Core', tags: ['setup'], due: due(2), assignee: AGENTS.coder },
    { title: 'Implement chat + model router', description: 'Request → analysis → ranking → model. Lumen Local always available.', priority: 'p0', category: 'AI', tags: ['router'], due: due(3), assignee: AGENTS.coder },
    { title: 'Build task system (local + Puter KV)', description: 'CRUD, priorities, tags, due dates, archive. Local mode never forces auth.', priority: 'p0', category: 'Core', tags: ['tasks', 'puter'], due: due(4), assignee: AGENTS.coder },
    { title: 'Knowledge ingest + RAG with citations', description: 'Ingest → chunk → embed → retrieve → rerank → generate → cite.', priority: 'p1', category: 'AI', tags: ['rag'], due: due(5), assignee: AGENTS.coder },
    { title: 'Agent loop with tool gateway', description: 'Understand → Plan → Tools → Execute → Verify. Every call risk-classified.', priority: 'p0', category: 'Agents', tags: ['agents', 'security'], due: due(6), assignee: AGENTS.architect },
    { title: 'Security: approval queue + sandbox', description: 'Low/Medium/High/Critical risk. Allow Once / Session / Inspect. Audit log.', priority: 'p0', category: 'Security', tags: ['security'], due: due(6), assignee: AGENTS.security },
    { title: 'Memory store (facts, preferences)', description: 'WHAT the system knows; retrieved into context where relevant.', priority: 'p1', category: 'AI', tags: ['memory'], due: due(7), assignee: AGENTS.coder },
    { title: 'Workflows: DAG editor + n8n export', description: 'Triggers, schedules, webhooks, human approval nodes. Export standard n8n JSON.', priority: 'p1', category: 'Automation', tags: ['n8n', 'workflows'], due: due(8), assignee: AGENTS.coder },
    { title: 'Evaluation suite + reports', description: 'Accuracy, hallucination, latency, cost, reproducibility. Two-run stability.', priority: 'p1', category: 'Evaluation', tags: ['eval'], due: due(8), assignee: AGENTS.tester },
    { title: 'Observability: OTel-compatible traces', description: 'Request → Router → Model → Agent → Tool → Response waterfall.', priority: 'p2', category: 'Observability', tags: ['otel'], due: due(9), assignee: AGENTS.coder },
    { title: 'Deployments: local, Docker, Puter', description: 'Pre-deploy secret scan, health checks, rollback notes.', priority: 'p1', category: 'Launch', tags: ['deploy'], due: due(10), assignee: AGENTS.ops },
    { title: 'Unit tests for core modules', description: 'Router, embeddings, risk policy, workflow validator, n8n exporter.', priority: 'p0', category: 'Quality', tags: ['tests'], due: due(9), assignee: AGENTS.tester },
    { title: 'Docs: README, architecture, privacy', description: 'SOTA documentation: quick start, modes, data flow, threats.', priority: 'p2', category: 'Docs', tags: ['docs'], due: due(10), assignee: AGENTS.writer },
    { title: 'Launch checklist + public demo', description: 'Landing page, live demo mode, contact, one-paragraph pitch.', priority: 'p2', category: 'Launch', tags: ['launch'], due: due(12), assignee: AGENTS.human },
  ];
  return rows.map((r, i) => mkTask(r, i));
}

/** LLM path: ask a reachable model for JSON, parse defensively, fall back locally. */
async function llmPlan(goal: string, models: ModelInfo[], settings: Settings): Promise<SutraTask[] | null> {
  const pool = reachableModels(models, settings).filter((m) => m.id !== 'sutra-local');
  if (!pool.length) return null;
  const m = pool[0];
  const provider = providerFor(m, settings);
  if (!provider) return null;
  const prompt = `You are a project planner. Convert this goal into 10-16 tasks.
Goal: "${goal}"

Respond with STRICT JSON only: an array of objects with keys:
title (string), description (string), priority ("p0"|"p1"|"p2"|"p3"), category (string), tags (string[]), dueInDays (number), assignee (one of "human","architect","coder","tester","security","writer","ops").
No markdown, no prose.`;
  let out = '';
  try {
    await provider.chat({ messages: [{ role: 'user', content: prompt }], temperature: 0.3, maxTokens: 1600 }, (c) => {
      if (!c.done && c.text) out += c.text;
    });
  } catch {
    return null;
  }
  const mJson = out.match(/\[[\s\S]*\]/);
  if (!mJson) return null;
  try {
    const arr = JSON.parse(mJson[0]) as Array<Record<string, unknown>>;
    if (!Array.isArray(arr) || !arr.length || typeof arr[0]?.title !== 'string') return null;
    return arr.slice(0, 16).map((t, i) =>
      mkTask(
        {
          title: String(t.title).slice(0, 120),
          description: String(t.description ?? '').slice(0, 300),
          priority: (['p0', 'p1', 'p2', 'p3'].includes(String(t.priority)) ? t.priority : 'p1') as SutraTask['priority'],
          category: String(t.category ?? 'Core').slice(0, 24),
          tags: Array.isArray(t.tags) ? (t.tags as unknown[]).map(String).slice(0, 5) : [],
          due: typeof t.dueInDays === 'number' ? todayIso(t.dueInDays) : null,
          assignee: AGENTS[String(t.assignee)] ?? AGENTS.human,
        },
        i,
      ),
    );
  } catch {
    return null;
  }
}

export interface PlanResult {
  tasks: SutraTask[];
  source: 'llm' | 'local';
  model?: string;
}

export async function planFromGoal(goal: string, models: ModelInfo[], settings: Settings): Promise<PlanResult> {
  const llm = await llmPlan(goal, models, settings);
  if (llm && llm.length >= 6) {
    return { tasks: llm, source: 'llm', model: 'connected model' };
  }
  return { tasks: localPlan(goal), source: 'local' };
}

/** Convert an accepted task list into a workflow (chain of steps). */
export function tasksToWorkflowNodes(tasks: SutraTask[]): Array<{ id: string; label: string; type: string; config: Record<string, string> }> {
  return tasks.slice(0, 12).map((t, i) => ({
    id: `t${i}`,
    label: t.title.slice(0, 40),
    type: t.category === 'Security' ? 'approval' : t.assignee.kind === 'agent' ? 'ai' : 'setVar',
    config: { task: t.id, priority: t.priority },
  }));
}
