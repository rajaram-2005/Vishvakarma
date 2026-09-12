// §115 + §120/§121 — The user surfaces, built ON TOP of the ONE CORE rather than
// as independent apps. Each surface is a thin service that plans/validates/runs
// through OrchestrationCore, so they all share identity, context, compatibility,
// execution, permission, security, storage, observability and events.

import { OrchestrationCore } from './core';
import { Storage, MemoryStorage } from './storage';
import { SearchEngine } from './search';
import { ScheduleManager } from './scheduling';
import { runWorkflow, compileWorkflow, type Workflow } from './workflows';
import { selectModel } from './router';
import type { CompatibilityContext, NodeExecutor, ModelInfo, RunResult, RoutingMode } from './types';

export interface LibraryAsset {
  id: string;
  title: string;
  text: string;
  tags?: string[];
  createdAt: string;
}

export class ChatService {
  constructor(private readonly core: OrchestrationCore, private readonly storage: Storage = new MemoryStorage()) {}

  /** Chat is the universal entry point: request -> task graph -> execution. */
  async ask(text: string, executor: NodeExecutor, ctx: CompatibilityContext): Promise<RunResult> {
    const { graph } = this.core.plan(text);
    const result = await this.core.run(graph, executor, { context: ctx });
    this.storage.set('chats', `chat_${Date.now()}`, { text, completed: result.completed });
    return result;
  }
}

export class LibraryService {
  private engine = new SearchEngine();

  constructor(private readonly core: OrchestrationCore, private readonly storage: Storage = new MemoryStorage()) {}

  save(asset: Omit<LibraryAsset, 'id' | 'createdAt'>): LibraryAsset {
    const full: LibraryAsset = { id: `lib_${this.storage.keys('library').length + 1}`, createdAt: new Date().toISOString(), ...asset };
    this.storage.set('library', full.id, full);
    this.engine.index({ id: full.id, kind: 'knowledge', title: full.title, text: full.text, tags: full.tags });
    return full;
  }

  get(id: string): LibraryAsset | undefined {
    return this.storage.get<LibraryAsset>('library', id);
  }

  list(): LibraryAsset[] {
    return this.storage.list<LibraryAsset>('library');
  }

  search(q: string) {
    return this.engine.search(q);
  }
}

export class StudioService {
  constructor(private readonly core: OrchestrationCore) {}
  /** Creative/media generation is just another task graph run through the core. */
  async generate(prompt: string, executor: NodeExecutor, ctx: CompatibilityContext): Promise<RunResult> {
    return this.core.run(this.core.plan(`Create studio assets: ${prompt}`).graph, executor, { context: ctx });
  }
}

export class CoderService {
  constructor(private readonly core: OrchestrationCore) {}
  async code(task: string, executor: NodeExecutor, ctx: CompatibilityContext): Promise<RunResult> {
    return this.core.run(this.core.plan(`Code task: ${task}`).graph, executor, { context: ctx });
  }
}

export class SchedulerService {
  private manager = new ScheduleManager();
  constructor(private readonly core: OrchestrationCore, private readonly storage: Storage = new MemoryStorage()) {
    for (const s of this.manager.list()) this.storage.set('schedules', s.id, s);
  }

  schedule(name: string, request: string, expr: string, timezone: string, misfire: 'skip' | 'run-immediately' | 'run-next' = 'run-next'): string {
    const s = this.manager.create({
      id: `sch_${this.storage.keys('schedules').length + 1}`,
      name,
      expr,
      timezone,
      retryPolicy: { maxRetries: 2, backoffMs: 1000 },
      misfire,
    });
    // Stash the request with the schedule.
    this.storage.set('schedule-requests', s.id, request);
    this.storage.set('schedules', s.id, s);
    return s.id;
  }

  /** Number of registered schedules (for status reporting). */
  count(): number {
    return this.manager.list().length;
  }

  /** Run any schedules whose nextRun is due. Returns run results keyed by schedule id. */
  async tick(executor: NodeExecutor, ctx: CompatibilityContext, now = new Date()): Promise<Record<string, RunResult>> {
    const out: Record<string, RunResult> = {};
    for (const s of this.manager.list()) {
      if (new Date(s.nextRun).getTime() <= now.getTime() && s.status === 'active') {
        const req = this.storage.get<string>('schedule-requests', s.id);
        if (req) out[s.id] = await this.core.run(this.core.plan(req).graph, executor, { context: ctx });
        this.manager.markRun(s.id, 'success', 0);
      }
    }
    return out;
  }
}

export class ModelManager {
  constructor(private readonly core: OrchestrationCore) {}
  /** The registry stores models as CapabilityContracts; map them back to the
   *  ModelInfo shape the router expects. */
  list(): ModelInfo[] {
    return this.core.registry
      .all()
      .filter((c) => c.type === 'model')
      .map(
        (c) =>
          ({
            id: c.id,
            name: c.id,
            provider: c.provider,
            runtime: c.runtime === 'local' ? 'ollama' : 'openai-compat',
            contextWindow: 8000,
            costIn: 0,
            costOut: 0,
            latencyTier: 'medium',
            capabilities: c.capabilities,
            available: true,
            local: c.runtime === 'local',
          }) as ModelInfo,
      );
  }
  route(mode: RoutingMode, ctx: CompatibilityContext, text = ''): ModelInfo | null {
    return selectModel(this.list(), mode, { ...ctx, text });
  }
}

export class WorkflowRunner {
  constructor(private readonly core: OrchestrationCore) {}
  compile(wf: Workflow) {
    return compileWorkflow(wf);
  }
  run(wf: Workflow, executor: NodeExecutor, ctx: CompatibilityContext) {
    return runWorkflow(this.core, wf, executor, { context: ctx });
  }
}

export class PluginSystem {
  constructor(private readonly core: OrchestrationCore) {}
  install(def: { id: string; name: string; capabilities?: string[]; permissions?: string[] }) {
    return this.core.registerCapability({
      id: def.id,
      version: '1.0',
      type: 'plugin',
      provider: 'user',
      capabilities: def.capabilities ?? [def.name],
      inputs: ['text'],
      outputs: ['text'],
      dependencies: [],
      permissions: def.permissions ?? [],
      modalities: ['text-to-text'],
      runtime: 'cloud',
      hardware: [],
      network: 'required',
      license: 'MIT',
      securityLevel: 'public',
      availability: 'stable',
    });
  }
  list() {
    return this.core.registry.all().filter((c) => c.type === 'plugin');
  }
}

export class McpSystem {
  constructor(private readonly core: OrchestrationCore) {}
  install(def: { id: string; name: string; tools?: string[] }) {
    return this.core.registerCapability({
      id: def.id,
      version: '1.0',
      type: 'mcp',
      provider: 'user',
      capabilities: def.tools ?? [def.name],
      inputs: ['text'],
      outputs: ['text'],
      dependencies: [],
      permissions: [],
      modalities: ['text-to-text'],
      runtime: 'local',
      hardware: ['cpu'],
      network: 'optional',
      license: 'MIT',
      securityLevel: 'public',
      availability: 'stable',
    });
  }
  list() {
    return this.core.registry.all().filter((c) => c.type === 'mcp');
  }
}

export class SearchService {
  private engine = new SearchEngine();
  constructor(core: OrchestrationCore) {
    for (const c of core.registry.all()) {
      this.engine.index({ id: c.id, kind: c.type, title: c.id, text: c.capabilities.join(' '), tags: c.capabilities });
    }
  }
  search(q: string) {
    return this.engine.search(q);
  }
}
