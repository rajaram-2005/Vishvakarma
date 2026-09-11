/**
 * RAVANA · Task scheduler (spec §6–8).
 *
 *   plan → ready set (all dependencies passed) → bounded-concurrency waves.
 *
 * Pure functions over the DAG, exported for tests. Scheduling policy: dependencies gate a node;
 * among ready nodes, priority then id order decide; up to `concurrency` nodes run per wave.
 */
import type { RavanaPlanNode } from "../types";

export type DepState = "passed" | "failed" | "skipped" | "missing" | "pending";

export function depStatus(plan: RavanaPlanNode[], node: RavanaPlanNode): DepState {
  const byId = new Map(plan.map((n) => [n.id, n]));
  for (const d of node.dependencies) {
    const dep = byId.get(d);
    if (!dep) return "missing";
    if (dep.status === "failed") return "failed";
    if (dep.status === "passed" || dep.status === "skipped") continue;
    return "pending";
  }
  return "passed";
}

/** Nodes whose dependencies are all passed (or skipped) and are pending — runnable now. */
export function readyNodes(plan: RavanaPlanNode[], concurrency = 3): RavanaPlanNode[] {
  const ready = plan
    .filter((n) => n.status === "pending" && (depStatus(plan, n) === "passed" || depStatus(plan, n) === "skipped"))
    .sort((a, b) => prioRank(b.priority) - prioRank(a.priority) || a.id.localeCompare(b.id));
  return ready.slice(0, Math.max(1, concurrency));
}

/** Nodes that can never run (a dependency failed) — engine marks them skipped with a note. */
export function blockedNodes(plan: RavanaPlanNode[]): RavanaPlanNode[] {
  return plan.filter((n) => n.status === "pending" && depStatus(plan, n) === "failed");
}

export function planDone(plan: RavanaPlanNode[]): boolean {
  return plan.every((n) => n.status === "passed" || n.status === "skipped");
}

export function planFailed(plan: RavanaPlanNode[]): boolean {
  return plan.some((n) => n.status === "failed");
}

export function planProgress(plan: RavanaPlanNode[]): { total: number; passed: number; running: number; pending: number; failed: number; skipped: number } {
  const s = { total: plan.length, passed: 0, running: 0, pending: 0, failed: 0, skipped: 0 };
  for (const n of plan) {
    if (n.status === "passed") s.passed++;
    else if (n.status === "running") s.running++;
    else if (n.status === "failed") s.failed++;
    else if (n.status === "skipped") s.skipped++;
    else s.pending++;
  }
  return s;
}

function prioRank(p: string): number {
  return p === "high" ? 2 : p === "normal" ? 1 : 0;
}
