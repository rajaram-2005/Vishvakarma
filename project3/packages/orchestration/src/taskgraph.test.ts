import { describe, it, expect } from 'vitest';
import { TaskGraphBuilder, topoOrder, nextRunnable, cascadeSkip, isComplete, hasFailed } from './taskgraph';
import type { TaskGraph } from './types';

function simpleGraph(): TaskGraph {
  const b = new TaskGraphBuilder();
  b.add({ id: 'a', name: 'A' });
  b.add({ id: 'b', name: 'B', dependsOn: ['a'] });
  b.add({ id: 'c', name: 'C', dependsOn: ['a', 'b'] });
  return b.build('g', 'request');
}

describe('TaskGraph', () => {
  it('builds a valid graph', () => {
    const g = simpleGraph();
    expect(Object.keys(g.nodes)).toEqual(['a', 'b', 'c']);
  });

  it('rejects a missing dependency at build time', () => {
    const b = new TaskGraphBuilder();
    b.add({ id: 'a', name: 'A', dependsOn: ['ghost'] });
    expect(() => b.build('g', 'r')).toThrow(/missing/);
  });

  it('rejects a cycle', () => {
    const b = new TaskGraphBuilder();
    b.add({ id: 'a', name: 'A', dependsOn: ['b'] });
    b.add({ id: 'b', name: 'B', dependsOn: ['a'] });
    expect(() => b.build('g', 'r')).toThrow(/cycle/i);
  });

  it('topologically orders nodes', () => {
    const order = topoOrder(simpleGraph());
    expect(order.indexOf('a')).toBeLessThan(order.indexOf('b'));
    expect(order.indexOf('b')).toBeLessThan(order.indexOf('c'));
  });

  it('computes next runnable nodes', () => {
    const g = simpleGraph();
    expect(nextRunnable(g)).toEqual(['a']);
    g.nodes['a'].status = 'completed';
    expect(nextRunnable(g)).toEqual(['b']);
  });

  it('cascades skip to dependents of a failure', () => {
    const g = simpleGraph();
    g.nodes['b'].status = 'failed';
    cascadeSkip(g, 'b');
    expect(g.nodes['b'].status).toBe('failed');
    expect(g.nodes['c'].status).toBe('skipped');
  });

  it('reports completion and failure', () => {
    const g = simpleGraph();
    g.nodes['a'].status = 'completed';
    g.nodes['b'].status = 'completed';
    g.nodes['c'].status = 'completed';
    expect(isComplete(g)).toBe(true);
    g.nodes['c'].status = 'failed';
    expect(hasFailed(g)).toBe(true);
  });
});
