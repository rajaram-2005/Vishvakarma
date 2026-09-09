import { describe, expect, it } from 'vitest';
import { toN8nJson, topoOrder, validateWorkflow, type WfWorkflow } from '@sutra/workflow-sdk';

const valid: WfWorkflow = {
  id: 'wf-test',
  name: 'pipeline',
  description: 'test pipeline',
  trigger: 'manual',
  nodes: [
    { id: 'a', type: 'trigger', label: 'Start', config: {} },
    { id: 'b', type: 'ai', label: 'Think', config: { prompt: 'x' } },
    { id: 'c', type: 'approval', label: 'Approve', config: {} },
  ],
  edges: [
    ['a', 'b'],
    ['b', 'c'],
  ],
};

describe('validateWorkflow', () => {
  it('accepts a valid DAG', () => {
    expect(validateWorkflow(valid)).toEqual([]);
  });

  it('requires a name, nodes and exactly one trigger', () => {
    expect(validateWorkflow({ ...valid, name: '' })).toContain('workflow needs a name');
    expect(validateWorkflow({ ...valid, nodes: [] })).toContain('workflow has no nodes');
    expect(validateWorkflow({ ...valid, nodes: [valid.nodes[1]] })).toContain('workflow needs a trigger node');
    const twoTriggers: WfWorkflow = {
      ...valid,
      nodes: [...valid.nodes, { id: 'z', type: 'trigger', label: 'Second', config: {} }],
    };
    expect(validateWorkflow(twoTriggers)).toContain('only one trigger node is allowed');
  });

  it('rejects unknown edge endpoints and self-loops', () => {
    const bad: WfWorkflow = {
      ...valid,
      edges: [...valid.edges, ['a', 'nope']],
    };
    expect(validateWorkflow(bad).join(' ')).toMatch(/unknown node/);
    const loop: WfWorkflow = { ...valid, edges: [...valid.edges, ['b', 'b']] };
    expect(validateWorkflow(loop)).toContain('self-loops are not allowed');
  });

  it('detects cycles', () => {
    const cyc: WfWorkflow = {
      ...valid,
      edges: [
        ['a', 'b'],
        ['b', 'c'],
        ['c', 'a'],
      ],
    };
    expect(validateWorkflow(cyc)).toContain('workflow contains a cycle');
  });
});

describe('topoOrder', () => {
  it('orders nodes so every edge points forward', () => {
    const order = topoOrder(valid);
    expect(order).toHaveLength(3);
    expect(order[0]).toBe('a');
    expect(order.indexOf('a')).toBeLessThan(order.indexOf('b'));
    expect(order.indexOf('b')).toBeLessThan(order.indexOf('c'));
  });
});

describe('toN8nJson', () => {
  it('emits standard n8n workflow JSON', () => {
    const j = JSON.parse(toN8nJson(valid));
    expect(j.name).toBe('pipeline');
    expect(j.settings.executionOrder).toBe('v1');
    expect(j.nodes).toHaveLength(3);
    expect(j.nodes[0].type).toBe('n8n-nodes-base.manualTrigger');
    expect(j.nodes.find((n: { type: string }) => n.type === '@n8n/n8n-nodes-langchain.chainLlm')).toBeTruthy();
    expect(j.connections['Start'].main[0][0].node).toBe('Think');
    expect(j.connections['Think'].main[0][0].node).toBe('Approve');
    // parameters carry node config
    expect(j.nodes[1].parameters.prompt).toBe('x');
  });
});
