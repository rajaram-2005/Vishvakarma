import { describe, expect, it } from 'vitest';
import { planFromGoal, tasksToWorkflowNodes } from '../apps/web/lib/planner';
import { SETTINGS, LOCAL } from './helpers';

describe('planFromGoal (local path — no connected model)', () => {
  it('produces a structured plan from the goal', async () => {
    const { tasks, source } = await planFromGoal('Plan my Project 3 MVP.', [LOCAL], SETTINGS);
    expect(['local', 'llm']).toContain(source);
    expect(tasks.length).toBeGreaterThanOrEqual(6);
    expect(tasks.length).toBeLessThanOrEqual(16);
    for (const t of tasks) {
      expect(t.id).toMatch(/^task[_-]/);
      expect(t.title.length).toBeGreaterThan(0);
      expect(['p0', 'p1', 'p2', 'p3']).toContain(t.priority);
      expect(['human', 'agent']).toContain(t.assignee.kind);
      expect(t.assignee.id).toBeTruthy();
    }
    // ids unique
    expect(new Set(tasks.map((t) => t.id)).size).toBe(tasks.length);
  }, 15000);

  it('includes security and evaluation tasks for an MVP goal', async () => {
    const { tasks } = await planFromGoal('Plan my Project 3 MVP.', [LOCAL], SETTINGS);
    const cats = tasks.map((t) => t.category.toLowerCase()).join(' ');
    expect(cats).toMatch(/security/);
    expect(cats).toMatch(/evaluation/);
  }, 15000);
});

describe('tasksToWorkflowNodes', () => {
  it('chains tasks into workflow nodes with t-prefixed ids', async () => {
    const { tasks } = await planFromGoal('Plan my Project 3 MVP.', [LOCAL], SETTINGS);
    const nodes = tasksToWorkflowNodes(tasks);
    expect(nodes.length).toBe(Math.min(12, tasks.length));
    expect(nodes[0].id).toBe('t0');
    expect(nodes[nodes.length - 1].id).toBe(`t${nodes.length - 1}`);
    for (const n of nodes) {
      expect(['trigger', 'ai', 'setVar', 'approval']).toContain(n.type);
      expect(n.config.task).toBeTruthy();
      expect(n.config.priority).toMatch(/^p[0-3]$/);
    }
  }, 15000);
});
