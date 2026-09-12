// §5 / §6 — Universal Task Graph.
//
// Natural-language requests become executable task graphs. Each node carries
// input/output/dependencies/model/tools/permissions/status/retries/result/
// evidence. This module validates graphs (missing deps, cycles) and computes
// safe execution order.

import type { TaskGraph, TaskNode, TaskStatus } from './types';

export interface TaskNodeInput {
  id: string;
  name: string;
  group?: string;
  input?: Record<string, unknown>;
  dependsOn?: string[];
  model?: string;
  tools?: string[];
  permissions?: string[];
  status?: TaskStatus;
  maxRetries?: number;
}

export class TaskGraphBuilder {
  private nodes: Record<string, TaskNode> = {};

  add(node: TaskNodeInput): TaskNode {
    if (this.nodes[node.id]) {
      throw new Error(`Duplicate task node id: ${node.id}`);
    }
    const full: TaskNode = {
      id: node.id,
      name: node.name,
      group: node.group,
      input: node.input ?? {},
      dependsOn: node.dependsOn ?? [],
      model: node.model,
      tools: node.tools ?? [],
      permissions: node.permissions ?? [],
      status: node.status ?? 'pending',
      retries: 0,
      maxRetries: node.maxRetries ?? 3,
    };
    this.nodes[node.id] = full;
    return full;
  }

  /** Validate dependencies exist and the graph is acyclic, then build. */
  build(id: string, root: string): TaskGraph {
    const errors = this.validate();
    if (errors.length) {
      throw new Error(`Invalid task graph: ${errors.join('; ')}`);
    }
    return { id, root, nodes: { ...this.nodes } };
  }

  /** Return validation errors without throwing (missing deps, cycles). */
  validate(): string[] {
    const errors: string[] = [];
    for (const n of Object.values(this.nodes)) {
      for (const d of n.dependsOn) {
        if (!this.nodes[d]) errors.push(`node ${n.id} depends on missing ${d}`);
      }
    }
    // Cycle detection via DFS coloring.
    const WHITE = 0;
    const GRAY = 1;
    const BLACK = 2;
    const color = new Map<string, number>();
    for (const id of Object.keys(this.nodes)) color.set(id, WHITE);
    const stack: string[] = [];
    const visit = (id: string): void => {
      const node = this.nodes[id];
      if (!node) return; // missing dependency; reported separately
      color.set(id, GRAY);
      stack.push(id);
      for (const d of node.dependsOn) {
        const c = color.get(d) ?? WHITE;
        if (c === GRAY) {
          errors.push(`cycle detected: ${[...stack, d].join(' -> ')}`);
          return;
        }
        if (c === WHITE) visit(d);
      }
      stack.pop();
      color.set(id, BLACK);
    };
    for (const id of Object.keys(this.nodes)) {
      if (color.get(id) === WHITE) visit(id);
    }
    return errors;
  }
}

/** Kahn's algorithm: a stable topological order of node ids.
 *  `dependsOn` declares prerequisites, so a node's indegree is the number of
 *  its prerequisites; nodes with indegree 0 (no prerequisites) run first. */
export function topoOrder(graph: TaskGraph): string[] {
  const indeg = new Map<string, number>();
  for (const n of Object.values(graph.nodes)) indeg.set(n.id, n.dependsOn.length);
  const queue = Object.keys(graph.nodes).filter((id) => (indeg.get(id) ?? 0) === 0);
  const out: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    out.push(id);
    for (const n of Object.values(graph.nodes)) {
      if (n.dependsOn.includes(id)) {
        const v = (indeg.get(n.id) ?? 1) - 1;
        indeg.set(n.id, v);
        if (v === 0) queue.push(n.id);
      }
    }
  }
  if (out.length !== Object.keys(graph.nodes).length) {
    throw new Error('Task graph contains a cycle');
  }
  return out;
}

/** Node ids whose dependencies are all completed (ready to run now). */
export function nextRunnable(graph: TaskGraph): string[] {
  return Object.values(graph.nodes)
    .filter((n) => !['completed', 'cancelled', 'skipped', 'failed'].includes(n.status))
    .filter((n) => n.dependsOn.every((d) => graph.nodes[d]?.status === 'completed'))
    .map((n) => n.id);
}

export function isComplete(graph: TaskGraph): boolean {
  return Object.values(graph.nodes).every((n) =>
    ['completed', 'cancelled', 'skipped'].includes(n.status),
  );
}

export function hasFailed(graph: TaskGraph): boolean {
  return Object.values(graph.nodes).some((n) => n.status === 'failed');
}

/** Mark every node that transitively depends on `failedId` as skipped. */
export function cascadeSkip(graph: TaskGraph, failedId: string): void {
  const dependents = new Map<string, string[]>();
  for (const n of Object.values(graph.nodes)) {
    for (const d of n.dependsOn) {
      const list = dependents.get(d) ?? [];
      list.push(n.id);
      dependents.set(d, list);
    }
  }
  const queue = [...(dependents.get(failedId) ?? [])];
  while (queue.length) {
    const id = queue.shift()!;
    const node = graph.nodes[id];
    if (node && node.status !== 'completed') {
      node.status = 'skipped';
      queue.push(...(dependents.get(id) ?? []));
    }
  }
}
