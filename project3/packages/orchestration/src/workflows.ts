// §42 / §43 / §44 — Workflow Builder, Templates and Debugger.
//
// Workflows are authored as node graphs (Trigger / AI / Model / Bot / Plugin /
// MCP / HTTP / DB / File / Condition / Loop / Transform / HumanApproval /
// Notification / Schedule) and compiled into the core's Universal Task Graph,
// so they inherit compatibility, state machine, retries and tracing.

import { TaskGraphBuilder } from './taskgraph';
import { OrchestrationCore } from './core';
import type { NodeExecutor, TaskGraph } from './types';

export type WorkflowNodeKind =
  | 'trigger'
  | 'ai'
  | 'model'
  | 'bot'
  | 'plugin'
  | 'mcp'
  | 'http'
  | 'db'
  | 'file'
  | 'condition'
  | 'loop'
  | 'transform'
  | 'human-approval'
  | 'notification'
  | 'schedule';

export interface WorkflowNodeDef {
  id: string;
  kind: WorkflowNodeKind;
  name: string;
  dependsOn?: string[];
  config?: Record<string, unknown>;
}

export interface Workflow {
  id: string;
  name: string;
  nodes: WorkflowNodeDef[];
}

export const WORKFLOW_TEMPLATES: Array<{ id: string; name: string; build: () => Workflow }> = [
  {
    id: 'research-report',
    name: 'Research Report',
    build: () => ({
      id: 'wf1',
      name: 'Research Report',
      nodes: [
        { id: 'fetch', kind: 'trigger', name: 'Fetch Data' },
        { id: 'analyze', kind: 'ai', name: 'AI Analysis', dependsOn: ['fetch'], config: { prompt: 'analyze' } },
        { id: 'report', kind: 'ai', name: 'Generate Report', dependsOn: ['analyze'] },
        { id: 'save', kind: 'file', name: 'Save Library', dependsOn: ['report'] },
      ],
    }),
  },
  {
    id: 'scheduled-research',
    name: 'Scheduled Research',
    build: () => ({
      id: 'wf2',
      name: 'Scheduled Research',
      nodes: [
        { id: 'schedule', kind: 'schedule', name: 'Every Saturday' },
        { id: 'research', kind: 'ai', name: 'Research', dependsOn: ['schedule'] },
        { id: 'email', kind: 'notification', name: 'Email', dependsOn: ['research'] },
      ],
    }),
  },
];

/** Compile a workflow into a Universal Task Graph the core can execute. */
export function compileWorkflow(wf: Workflow): TaskGraph {
  const b = new TaskGraphBuilder();
  for (const n of wf.nodes) {
    b.add({
      id: n.id,
      name: n.name,
      group: 'Workflow',
      dependsOn: n.dependsOn ?? [],
      tools: n.kind === 'ai' || n.kind === 'model' ? ['ai'] : [n.kind],
      permissions: n.kind === 'human-approval' ? ['approval'] : [],
      input: n.config ?? {},
    });
  }
  return b.build(wf.id, 'workflow');
}

export interface WorkflowDebugEntry {
  id: string;
  name: string;
  status: string;
  durationMs?: number;
  error?: string;
  output?: unknown;
}

/** §44 — Run a workflow and return a debugger-friendly report. */
export async function runWorkflow(
  core: OrchestrationCore,
  wf: Workflow,
  executor: NodeExecutor,
  opts: { context?: unknown } = {},
): Promise<{ graph: TaskGraph; debug: WorkflowDebugEntry[]; traceId: string }> {
  const graph = compileWorkflow(wf);
  const t0 = Date.now();
  await core.run(graph, executor, opts as never);
  const debug: WorkflowDebugEntry[] = Object.values(graph.nodes).map((n) => ({
    id: n.id,
    name: n.name,
    status: n.status,
    error: n.error,
    output: n.result,
  }));
  return { graph, debug, traceId: core.tracer.all().slice(-1)[0]?.id ?? '' };
}
