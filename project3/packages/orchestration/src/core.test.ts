import { describe, it, expect, vi } from 'vitest';
import { OrchestrationCore } from './core';
import { CostEngine } from './cost';
import { NeedsPermissionError, type CapabilityContract, type NodeExecutor } from './types';
import type { NetworkRequirement, RuntimeKind } from './types';

const REQUEST =
  'Research solar EV charging, analyze these PDFs, create an engineering report, ' +
  'generate a diagram, build a dashboard, save everything, and remind me every Saturday.';

function registerScenario(core: OrchestrationCore): void {
  const tool = (
    id: string,
    permissions: string[],
    network: NetworkRequirement = 'none',
    runtime: RuntimeKind = 'local',
  ): void => {
    core.registerCapability({
      id,
      version: '1.0',
      type: 'tool',
      provider: 'test',
      capabilities: [id],
      inputs: ['text'],
      outputs: ['text'],
      dependencies: [],
      permissions,
      modalities: ['text-to-text'],
      runtime,
      hardware: ['cpu'],
      network,
      license: 'MIT',
      securityLevel: 'public',
      availability: 'stable',
    });
  };
  const model = (id: string): void => {
    core.registerCapability({
      id,
      version: '1.0',
      type: 'model',
      provider: 'test',
      capabilities: ['research', 'writing'],
      inputs: ['text'],
      outputs: ['text'],
      dependencies: [],
      permissions: [],
      modalities: ['text-to-text'],
      runtime: 'cloud',
      hardware: ['cpu'],
      network: 'required',
      license: 'proprietary',
      securityLevel: 'public',
      availability: 'stable',
    } as CapabilityContract);
  };

  model('research-model');
  model('writer-model');
  tool('search', ['network.request'], 'required', 'cloud');
  tool('retrieve', ['network.request'], 'required', 'cloud');
  tool('rag', ['fs.read'], 'optional');
  tool('file.read', ['fs.read']);
  tool('writing', []);
  tool('studio', []);
  tool('coder', ['fs.write']);
  tool('library.save', ['fs.write']);
  tool('schedule.create', ['fs.write']);
}

const context = {
  offline: false,
  privacyMode: 'cloud' as const,
  grantedPermissions: ['*'],
  availableHardware: ['cpu', 'gpu'],
};

const okExecutor: NodeExecutor = {
  async execute(node) {
    return { result: `ok:${node.id}`, evidence: [`ev:${node.id}`] };
  },
};

describe('OrchestrationCore — planning (§5/§122)', () => {
  it('plans the final scenario into a valid task graph', () => {
    const core = new OrchestrationCore();
    registerScenario(core);
    const { graph } = core.plan(REQUEST);
    for (const id of ['research', 'pdf-analysis', 'report', 'diagram', 'dashboard', 'library', 'schedule']) {
      expect(graph.nodes[id]).toBeDefined();
    }
    // report depends on both research and pdf-analysis (fan-in by stage).
    expect(graph.nodes['report'].dependsOn.sort()).toEqual(['pdf-analysis', 'research']);
    // schedule is last and depends on the library tail.
    expect(graph.nodes['schedule'].dependsOn).toContain('library');
  });

  it('validates the plan as fully compatible', () => {
    const core = new OrchestrationCore();
    registerScenario(core);
    const { graph } = core.plan(REQUEST);
    const reports = core.validatePlan(graph, context);
    for (const [id, r] of reports) {
      expect(r.compatible, `node ${id} should be compatible`).toBe(true);
    }
  });

  it('compose() returns graph + reports + trace id', () => {
    const core = new OrchestrationCore();
    registerScenario(core);
    const composed = core.compose(REQUEST, context);
    expect(composed.graph.nodes['research']).toBeDefined();
    expect(composed.reports.size).toBe(Object.keys(composed.graph.nodes).length);
    expect(composed.traceId).toBeTruthy();
  });
});

describe('OrchestrationCore — execution engine (§7/§8/§45/§63)', () => {
  it('runs every node, emits events and traces', async () => {
    const core = new OrchestrationCore();
    registerScenario(core);
    const { graph } = core.plan(REQUEST);
    const completedEvents = vi.fn();
    core.bus.on('task.completed', completedEvents);
    const result = await core.run(graph, okExecutor, { context });
    expect(result.failed).toEqual([]);
    expect(result.completed).toEqual(Object.keys(graph.nodes));
    expect(completedEvents).toHaveBeenCalledTimes(Object.keys(graph.nodes).length);
    expect(result.trace.spans.length).toBe(Object.keys(graph.nodes).length);
    expect(result.trace.status).toBe('ok');
    // Evidence was attached to each node.
    expect(graph.nodes['report'].evidence).toEqual(['ev:report']);
  });

  it('resumes from completed checkpoints without re-running them', async () => {
    const core = new OrchestrationCore();
    registerScenario(core);
    const { graph } = core.plan(REQUEST);
    const calls: string[] = [];
    const exec: NodeExecutor = {
      async execute(node) {
        calls.push(node.id);
        return { result: node.id };
      },
    };
    // Simulate an interruption: research already completed.
    graph.nodes['research'].status = 'completed';
    const result = await core.run(graph, exec, { context });
    expect(calls).not.toContain('research');
    expect(result.completed).toEqual(Object.keys(graph.nodes).filter((n) => n !== 'research'));
  });

  it('retries transient failures then succeeds', async () => {
    const core = new OrchestrationCore();
    registerScenario(core);
    const { graph } = core.plan(REQUEST);
    const exec: NodeExecutor = {
      async execute(node) {
        if (node.id === 'report' && node.retries < 2) {
          throw new Error('transient');
        }
        return { result: node.id };
      },
    };
    const result = await core.run(graph, exec, { context });
    expect(result.failed).toEqual([]);
    expect(graph.nodes['report'].status).toBe('completed');
    expect(graph.nodes['report'].retries).toBe(2);
  });

  it('cascades failure to dependents and emits task.failed', async () => {
    const core = new OrchestrationCore();
    registerScenario(core);
    const { graph } = core.plan(REQUEST);
    const failedEvent = vi.fn();
    core.bus.on('task.failed', failedEvent);
    const exec: NodeExecutor = {
      async execute(node) {
        if (node.id === 'report') throw new Error('hard failure');
        return { result: node.id };
      },
    };
    const result = await core.run(graph, exec, { context });
    expect(result.failed).toContain('report');
    expect(graph.nodes['report'].status).toBe('failed');
    // Everything downstream of report is skipped.
    for (const id of ['diagram', 'dashboard', 'library', 'schedule']) {
      expect(graph.nodes[id].status).toBe('skipped');
    }
    expect(failedEvent).toHaveBeenCalled();
  });

  it('pauses for a permission requirement instead of failing', async () => {
    const core = new OrchestrationCore();
    registerScenario(core);
    const { graph } = core.plan(REQUEST);
    const exec: NodeExecutor = {
      async execute(node) {
        if (node.id === 'schedule') {
          throw new NeedsPermissionError('needs write to create schedule', 'fs.write');
        }
        return { result: node.id };
      },
    };
    const result = await core.run(graph, exec, { context, pauseForPermission: true });
    expect(result.paused).toBe('schedule');
    expect(graph.nodes['schedule'].status).toBe('waiting_for_permission');
    // Upstream of the pause point still completed.
    expect(graph.nodes['library'].status).toBe('completed');
  });

  it('emits capability.registered on registration', () => {
    const core = new OrchestrationCore();
    const fn = vi.fn();
    core.bus.on('capability.registered', fn);
    core.registerCapability({
      id: 'x',
      version: '1.0',
      type: 'plugin',
      provider: 'p',
      capabilities: [],
      inputs: [],
      outputs: [],
      dependencies: [],
      permissions: [],
      modalities: [],
      runtime: 'local',
      hardware: ['cpu'],
      network: 'none',
      license: 'MIT',
      securityLevel: 'public',
      availability: 'stable',
    });
    expect(fn).toHaveBeenCalledWith({ capabilityId: 'x' });
  });
});

describe('OrchestrationCore — approval & cost integration (§34/§35/§64)', () => {
  it('surfaces an approval request and can be auto-approved', async () => {
    const core = new OrchestrationCore();
    registerScenario(core);
    const { graph } = core.plan(REQUEST);
    let scheduleAttempts = 0;
    const exec: NodeExecutor = {
      async execute(node) {
        // First attempt needs a permission; after approval it proceeds.
        if (node.id === 'schedule' && scheduleAttempts++ < 1) {
          throw new NeedsPermissionError('needs write to create schedule', 'fs.write', 'high');
        }
        return { result: node.id };
      },
    };
    // The caller (human/UI) approves the permission request.
    const result = await core.run(graph, exec, {
      context,
      pauseForPermission: true,
      onPermissionRequired: async () => 'approve-once',
    });
    expect(result.paused).toBeUndefined();
    expect(result.failed).toEqual([]);
    expect(graph.nodes['schedule'].status).toBe('completed');
    // The approval center recorded + resolved the request.
    expect(core.approvalCenter.list('approved').length).toBeGreaterThan(0);
  });

  it('denies a permission request and fails the node', async () => {
    const core = new OrchestrationCore();
    registerScenario(core);
    const { graph } = core.plan(REQUEST);
    const exec: NodeExecutor = {
      async execute(node) {
        if (node.id === 'schedule') {
          throw new NeedsPermissionError('needs write', 'fs.write', 'high');
        }
        return { result: node.id };
      },
    };
    const result = await core.run(graph, exec, {
      context,
      pauseForPermission: true,
      onPermissionRequired: async () => 'deny',
    });
    expect(result.failed).toContain('schedule');
    expect(graph.nodes['schedule'].status).toBe('failed');
  });

  it('records estimated cost during a run', async () => {
    const core = new OrchestrationCore();
    registerScenario(core);
    const { graph } = core.plan(REQUEST);
    const cost = new CostEngine();
    const result = await core.run(graph, okExecutor, {
      context,
      costEngine: cost,
      costScope: 'user:alice',
    });
    expect(result.failed).toEqual([]);
    expect(cost.total()).toBeGreaterThan(0);
    expect(cost.byScope('user:alice')).toBeGreaterThan(0);
  });
});
