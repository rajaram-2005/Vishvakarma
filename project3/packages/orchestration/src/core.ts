// §121 — THE ONE CORE.
//
// Every user experience (Chat, Studio, Coder, Library, Plugins, MCP,
// Schedules, Models, Workflows) is built on top of this single core rather
// than as independent applications. It composes:
//
//   Identity / Context / Capability Registry / Model Router /
//   Task Engine / Execution Engine / Permission Engine / Security /
//   Storage / Observability / Event System
//
// into one coherent, testable engine with an execution loop that honors the
// state machine (§7), resumable checkpoints (§8) and tracing (§63).

import { CapabilityRegistry } from './capabilities';
import { CompatibilityEngine } from './compatibility';
import { EventBus } from './events';
import { Tracer, type TraceBuilder } from './trace';
import { StateMachine, ResumableTask } from './statemachine';
import { topoOrder, cascadeSkip } from './taskgraph';
import { HealthRegistry } from './router';
import { planToTaskGraph } from './planner';
import type {
  CapabilityContract,
  CompatibilityContext,
  CompatibilityReport,
  ModelInfo,
  NodeExecutor,
  RunOptions,
  RunResult,
  TaskGraph,
  TaskNode,
} from './types';
import { NeedsPermissionError } from './types';

export interface ComposedPlan {
  graph: TaskGraph;
  reports: Map<string, CompatibilityReport>;
  traceId: string;
}

export class OrchestrationCore {
  readonly registry = new CapabilityRegistry();
  readonly compatibility = new CompatibilityEngine(this.registry);
  readonly bus = new EventBus();
  readonly tracer = new Tracer();
  readonly health = new HealthRegistry();

  registerCapability(cap: CapabilityContract): CapabilityContract {
    const c = this.registry.register(cap);
    void this.bus.emit('capability.registered', { capabilityId: c.id });
    return c;
  }

  removeCapability(id: string, version?: string): boolean {
    const ok = this.registry.remove(id, version);
    if (ok) void this.bus.emit('capability.removed', { capabilityId: id });
    return ok;
  }

  /** Register ModelInfo objects as discoverable 'model' capabilities. */
  registerModels(models: ModelInfo[]): void {
    for (const m of models) {
      this.registerCapability({
        id: m.id,
        version: '1.0',
        type: 'model',
        provider: m.provider,
        capabilities: m.capabilities,
        inputs: ['text'],
        outputs: ['text'],
        dependencies: [],
        permissions: [],
        modalities: ['text-to-text'],
        runtime: m.local ? 'local' : 'cloud',
        hardware: m.local ? ['cpu'] : [],
        network: m.local ? 'none' : 'required',
        license: 'proprietary',
        securityLevel: m.local ? 'restricted' : 'public',
        availability: 'stable',
        privacy: m.local ? 'local-only' : 'cloud-ok',
      });
    }
  }

  /** §5 — Plan a request into a task graph (with a trace). */
  plan(text: string): { graph: TaskGraph; trace: TraceBuilder } {
    const trace = this.tracer.start(`plan:${text.slice(0, 24)}`);
    const graph = planToTaskGraph(text, `tg_${trace.trace.id}`, 'request');
    trace.end('ok');
    return { graph, trace };
  }

  /** §122 — Plan + compatibility-validate in one call. */
  compose(text: string, context: CompatibilityContext): ComposedPlan {
    const { graph } = this.plan(text);
    const reports = this.validatePlan(graph, context);
    return { graph, reports, traceId: this.tracer.all().slice(-1)[0]?.id ?? '' };
  }

  /** §3 — Compatibility analysis for every node of a plan. */
  validatePlan(graph: TaskGraph, context: CompatibilityContext): Map<string, CompatibilityReport> {
    const out = new Map<string, CompatibilityReport>();
    const available = this.registry.all();
    for (const node of Object.values(graph.nodes)) {
      out.set(node.id, this.validateNode(node, available, context));
    }
    return out;
  }

  private validateNode(
    node: TaskNode,
    available: CapabilityContract[],
    context: CompatibilityContext,
  ): CompatibilityReport {
    const checks = [] as CompatibilityReport['checks'];
    const reasons: string[] = [];
    let compatible = true;
    let fallbackId: string | undefined;

    if (node.model) {
      const cap = this.registry.get(node.model) ?? this.synthetic(node.model, 'model');
      const r = this.compatibility.analyze({ required: cap, available, context });
      checks.push(...r.checks);
      reasons.push(...r.reasons);
      if (!r.compatible) compatible = false;
      if (r.fallbackId) fallbackId = r.fallbackId;
    }
    for (const tool of node.tools) {
      const cap = this.registry.get(tool) ?? this.synthetic(tool, 'tool');
      const r = this.compatibility.analyze({ required: cap, available, context });
      checks.push(...r.checks);
      reasons.push(...r.reasons);
      if (!r.compatible) compatible = false;
    }
    return { compatible, checks, reasons, fallbackId };
  }

  private synthetic(id: string, type: 'model' | 'tool' | 'plugin'): CapabilityContract {
    return {
      id,
      version: '1.0',
      type,
      provider: 'unknown',
      capabilities: [],
      inputs: [],
      outputs: [],
      dependencies: [],
      permissions: [],
      modalities: [],
      runtime: 'cloud',
      hardware: [],
      network: 'required',
      license: 'unknown',
      securityLevel: 'public',
      availability: 'stable',
    };
  }

  /**
   * Execution engine. Walks the (topological) task graph, drives each node
   * through the state machine, honors retries/maxRetries, pauses on
   * permission requirements, skips dependents of failures (§7), and resumes
   * from completed checkpoints (§8). Emits events (§45) and records a trace
   * (§63) for the whole run.
   */
  async run(graph: TaskGraph, executor: NodeExecutor, opts: RunOptions = {}): Promise<RunResult> {
    const trace = this.tracer.start(`run:${graph.id}`);
    const order = topoOrder(graph);
    const maxAttempts = opts.maxAttempts ?? 999;
    const completed: string[] = [];
    const failed: string[] = [];
    let attempts = 0;

    for (const id of order) {
      const node = graph.nodes[id];
      if (node.status === 'completed') {
        continue;
      }
      if (
        node.status === 'cancelled' ||
        node.status === 'skipped' ||
        !node.dependsOn.every((d) => graph.nodes[d]?.status === 'completed')
      ) {
        continue;
      }

      const sm = new StateMachine('QUEUED');
      sm.transition('PLANNING');
      sm.transition('RUNNING');
      node.status = 'running';
      let settled = false;

      while (!settled) {
        attempts += 1;
        if (attempts > maxAttempts) {
          node.status = 'failed';
          node.error = 'max attempts exceeded';
          cascadeSkip(graph, id);
          void this.bus.emit('task.failed', { taskId: id, error: node.error });
          trace.end('error');
          return { graph, completed, failed: [...failed, id], trace: trace.trace };
        }
        const span = trace.span(`node:${node.name}`, { nodeId: id, group: node.group ?? '' });
        try {
          const out = await executor.execute(node, { context: opts.context });
          node.status = 'completed';
          node.result = out.result;
          node.evidence = out.evidence;
          node.retries = Math.max(0, node.retries);
          sm.transition('VERIFYING');
          sm.transition('COMPLETED');
          span.end('ok', { status: 'completed' });
          void this.bus.emit('task.completed', { taskId: id });
          completed.push(id);
          settled = true;
        } catch (e) {
          if (e instanceof NeedsPermissionError && opts.pauseForPermission) {
            sm.transition('WAITING_FOR_PERMISSION');
            node.status = 'waiting_for_permission';
            span.end('ok', { status: 'waiting_for_permission', permission: e.permission });
            trace.end('ok');
            return { graph, completed, failed, paused: id, trace: trace.trace };
          }
          node.retries += 1;
          if (node.retries > node.maxRetries) {
            node.status = 'failed';
            node.error = (e as Error).message;
            sm.transition('FAILED');
            span.end('error', { error: node.error });
            void this.bus.emit('task.failed', { taskId: id, error: node.error });
            failed.push(id);
            cascadeSkip(graph, id);
            trace.end('error');
            return { graph, completed, failed, trace: trace.trace };
          }
          // Follow the spec failure chain: RUNNING -> FAILED -> RETRYING -> RUNNING.
          sm.transition('FAILED');
          sm.transition('RETRYING');
          sm.transition('RUNNING');
          span.end('error', { error: (e as Error).message, retry: String(node.retries) });
        }
      }
    }

    trace.end('ok');
    return { graph, completed, failed, trace: trace.trace };
  }

  /** §8 — Resume a previously interrupted run. Completed nodes are skipped. */
  resume(graph: TaskGraph, executor: NodeExecutor, opts: RunOptions = {}): Promise<RunResult> {
    return this.run(graph, executor, opts);
  }
}
