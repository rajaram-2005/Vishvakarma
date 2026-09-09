// SUTRA workflow SDK — provider-neutral workflow graphs with n8n export.
// The n8n bridge is an adapter: exported JSON is standard n8n workflow format,
// used in ways that respect n8n's terms of service.

export type WorkflowNodeType =
  | 'trigger'
  | 'ai'
  | 'http'
  | 'shell'
  | 'setVar'
  | 'condition'
  | 'approval'
  | 'code'
  | 'notify';

export interface WfNode {
  id: string;
  type: WorkflowNodeType;
  label: string;
  config: Record<string, string>;
}

export interface WfWorkflow {
  id: string;
  name: string;
  description: string;
  trigger: 'manual' | 'schedule' | 'webhook' | 'event';
  schedule?: string;
  nodes: WfNode[];
  edges: Array<[string, string]>;
}

export const NODE_TYPES: Array<{ type: WorkflowNodeType; label: string; description: string; risk: 'low' | 'medium' | 'high' | 'critical' }> = [
  { type: 'trigger', label: 'Trigger', description: 'Start point: manual, schedule, webhook or event.', risk: 'low' },
  { type: 'ai', label: 'AI Step', description: 'Prompt a model; store the answer in a variable.', risk: 'low' },
  { type: 'http', label: 'HTTP Request', description: 'Call an endpoint (GET/POST) with optional JSON body.', risk: 'medium' },
  { type: 'shell', label: 'Shell', description: 'Run a command inside the sandboxed terminal (gated by policy).', risk: 'high' },
  { type: 'setVar', label: 'Set Variable', description: 'Store a literal value for later nodes.', risk: 'low' },
  { type: 'condition', label: 'Condition', description: 'Continue only when a variable matches a value.', risk: 'low' },
  { type: 'approval', label: 'Human Approval', description: 'Pause the workflow until a human approves.', risk: 'low' },
  { type: 'code', label: 'Code Step', description: 'Evaluate a JS expression over workflow variables.', risk: 'high' },
  { type: 'notify', label: 'Notify', description: 'Emit an activity/notification event.', risk: 'low' },
];

export function validateWorkflow(wf: WfWorkflow): string[] {
  const errs: string[] = [];
  if (!wf.name?.trim()) errs.push('workflow needs a name');
  if (!wf.nodes?.length) errs.push('workflow has no nodes');
  const triggers = wf.nodes.filter((n) => n.type === 'trigger');
  if (triggers.length === 0) errs.push('workflow needs a trigger node');
  if (triggers.length > 1) errs.push('only one trigger node is allowed');
  const ids = new Set(wf.nodes.map((n) => n.id));
  for (const [a, b] of wf.edges ?? []) {
    if (!ids.has(a)) errs.push(`edge starts at unknown node "${a}"`);
    if (!ids.has(b)) errs.push(`edge points at unknown node "${b}"`);
    if (a === b) errs.push('self-loops are not allowed');
  }
  // cycle detection (Kahn)
  const indeg = new Map<string, number>();
  for (const n of wf.nodes) indeg.set(n.id, 0);
  for (const [a, b] of wf.edges ?? []) indeg.set(b, (indeg.get(b) ?? 0) + 1);
  const queue = wf.nodes.filter((n) => (indeg.get(n.id) ?? 0) === 0).map((n) => n.id);
  let seen = 0;
  while (queue.length) {
    const id = queue.shift() as string;
    seen++;
    for (const [a, b] of wf.edges ?? []) {
      if (a === id) {
        indeg.set(b, (indeg.get(b) ?? 0) - 1);
        if ((indeg.get(b) ?? 0) === 0) queue.push(b);
      }
    }
  }
  if (seen < wf.nodes.length) errs.push('workflow contains a cycle');
  return errs;
}

/** Topological order (execution order) for a valid DAG. */
export function topoOrder(wf: WfWorkflow): string[] {
  const indeg = new Map<string, number>();
  for (const n of wf.nodes) indeg.set(n.id, 0);
  for (const [a, b] of wf.edges ?? []) indeg.set(b, (indeg.get(b) ?? 0) + 1);
  const queue = wf.nodes.filter((n) => (indeg.get(n.id) ?? 0) === 0).map((n) => n.id);
  const out: string[] = [];
  while (queue.length) {
    const id = queue.shift() as string;
    out.push(id);
    for (const [a, b] of wf.edges ?? []) {
      if (a === id) {
        indeg.set(b, (indeg.get(b) ?? 0) - 1);
        if ((indeg.get(b) ?? 0) === 0) queue.push(b);
      }
    }
  }
  return out;
}

const N8N_MAP: Record<WorkflowNodeType, { type: string; typeVersion: number }> = {
  trigger: { type: 'n8n-nodes-base.manualTrigger', typeVersion: 1 },
  ai: { type: '@n8n/n8n-nodes-langchain.chainLlm', typeVersion: 2 },
  http: { type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2 },
  shell: { type: 'n8n-nodes-base.executeCommand', typeVersion: 1 },
  setVar: { type: 'n8n-nodes-base.set', typeVersion: 3.4 },
  condition: { type: 'n8n-nodes-base.if', typeVersion: 2 },
  approval: { type: 'n8n-nodes-base.wait', typeVersion: 1.1 },
  code: { type: 'n8n-nodes-base.code', typeVersion: 2 },
  notify: { type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1.1 },
};

/** Export as standard n8n workflow JSON (adapter — respects n8n terms). */
export function toN8nJson(wf: WfWorkflow): string {
  const nodes = wf.nodes.map((n, i) => ({
    id: n.id,
    name: n.label,
    type: N8N_MAP[n.type]?.type ?? 'n8n-nodes-base.noOp',
    typeVersion: N8N_MAP[n.type]?.typeVersion ?? 1,
    position: [40 + (i % 3) * 240, 40 + Math.floor(i / 3) * 180],
    parameters: { ...n.config },
  }));
  const connections: Record<string, { main: Array<Array<{ node: string; type: 'main'; index: number }>> }> = {};
  for (const n of wf.nodes) connections[n.label] = { main: [[]] };
  for (const [a, b] of wf.edges ?? []) {
    const from = wf.nodes.find((n) => n.id === a);
    const to = wf.nodes.find((n) => n.id === b);
    if (from && to) connections[from.label].main[0].push({ node: to.label, type: 'main', index: 0 });
  }
  return JSON.stringify(
    {
      name: wf.name,
      nodes,
      connections,
      settings: { executionOrder: 'v1' },
      pinData: {},
    },
    null,
    2,
  );
}
