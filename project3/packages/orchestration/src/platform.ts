// §120 / §121 — The complete system assembled from the ONE CORE. A single
// Platform object wires together identity/context (core), storage, every surface
// (Chat, Studio, Coder, Library, Scheduler, Models, Workflows, Plugins, MCP),
// search and adapters. This is the "ONE AI STUDIO" the spec describes, composed
// rather than reimplemented per surface.

import { OrchestrationCore } from './core';
import { MemoryStorage, type Storage } from './storage';
import { ChatService, LibraryService, StudioService, CoderService, SchedulerService, ModelManager, WorkflowRunner, PluginSystem, McpSystem, SearchService } from './surfaces';
import { buildSampleCore, demoExecutor, sampleContext, SAMPLE_REQUEST } from './sample';
import { WORKFLOW_TEMPLATES, type Workflow } from './workflows';
import type { CompatibilityContext, NodeExecutor } from './types';

export interface PlatformStatus {
  capabilities: number;
  library: number;
  schedules: number;
  plugins: number;
  mcps: number;
  models: number;
}

/** A default executor used when no real adapter is supplied (demo/smoke). */
function defaultExecutor(): NodeExecutor {
  return demoExecutor();
}

export class Platform {
  readonly core: OrchestrationCore;
  readonly storage: Storage;
  readonly chatService: ChatService;
  readonly library: LibraryService;
  readonly studio: StudioService;
  readonly coder: CoderService;
  readonly scheduler: SchedulerService;
  readonly models: ModelManager;
  readonly workflows: WorkflowRunner;
  readonly plugins: PluginSystem;
  readonly mcp: McpSystem;
  readonly search: SearchService;
  private executor: NodeExecutor;

  constructor(opts: { core?: OrchestrationCore; storage?: Storage; executor?: NodeExecutor; seedSample?: boolean } = {}) {
    this.core = opts.core ?? (opts.seedSample === false ? new OrchestrationCore() : buildSampleCore());
    this.storage = opts.storage ?? new MemoryStorage();
    this.executor = opts.executor ?? defaultExecutor();
    this.chatService = new ChatService(this.core, this.storage);
    this.library = new LibraryService(this.core, this.storage);
    this.studio = new StudioService(this.core);
    this.coder = new CoderService(this.core);
    this.scheduler = new SchedulerService(this.core, this.storage);
    this.models = new ModelManager(this.core);
    this.workflows = new WorkflowRunner(this.core);
    this.plugins = new PluginSystem(this.core);
    this.mcp = new McpSystem(this.core);
    this.search = new SearchService(this.core);
  }

  /** Run a Chat request through the core. */
  async chat(text = SAMPLE_REQUEST, ctx: CompatibilityContext = sampleContext) {
    return this.chatService.ask(text, this.executor, ctx);
  }

  /** Save a knowledge asset to the Library and make it searchable. */
  saveToLibrary(title: string, text: string, tags?: string[]) {
    return this.library.save({ title, text, tags });
  }

  /** Schedule a recurring request (e.g. "every Saturday"). */
  schedule(name: string, request: string, expr: string, timezone = 'UTC') {
    return this.scheduler.schedule(name, request, expr, timezone);
  }

  /** Run due schedules through the core. */
  tick(ctx: CompatibilityContext = sampleContext) {
    return this.scheduler.tick(this.executor, ctx);
  }

  /** Install a plugin or MCP server as a capability. */
  installPlugin(def: { id: string; name: string; capabilities?: string[]; permissions?: string[] }) {
    return this.plugins.install(def);
  }

  installMcp(def: { id: string; name: string; tools?: string[] }) {
    return this.mcp.install(def);
  }

  /** Run a workflow template through the core. */
  async runWorkflow(templateId = 'research-report', ctx: CompatibilityContext = sampleContext) {
    const wf: Workflow = (WORKFLOW_TEMPLATES.find((t) => t.id === templateId) ?? WORKFLOW_TEMPLATES[0]).build();
    return this.workflows.run(wf, this.executor, ctx);
  }

  /** Run a caller-supplied workflow definition (e.g. from the visual builder). */
  async runWorkflowObject(wf: Workflow, ctx: CompatibilityContext = sampleContext) {
    return this.workflows.run(wf, this.executor, ctx);
  }

  /** Run any schedules whose nextRun is due. */
  async tickNow(ctx: CompatibilityContext = sampleContext) {
    return this.scheduler.tick(this.executor, ctx);
  }

  /** Run a code task through the core (Coder surface). */
  async code(task: string, ctx: CompatibilityContext = sampleContext) {
    return this.coder.code(task, this.executor, ctx);
  }

  /** Run a creative/generation task through the core (Studio surface). */
  async studioRun(prompt: string, ctx: CompatibilityContext = sampleContext) {
    return this.studio.generate(prompt, this.executor, ctx);
  }

  searchLibrary(q: string) {
    return this.library.search(q);
  }

  status(): PlatformStatus {
    return {
      capabilities: this.core.registry.all().length,
      library: this.library.list().length,
      schedules: this.scheduler.count(),
      plugins: this.plugins.list().length,
      mcps: this.mcp.list().length,
      models: this.models.list().length,
    };
  }
}
