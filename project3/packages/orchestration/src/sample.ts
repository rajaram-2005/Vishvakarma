// Shared sample data + a demo executor so the ONE CORE can be run end-to-end
// from the CLI and the server. Demonstrates retry, permission approval, cost,
// health and tracing without any external services.

import { OrchestrationCore } from './core';
import { SearchEngine } from './search';
import { NeedsPermissionError, type CompatibilityContext, type ModelInfo, type NodeExecutor } from './types';

/** A small semantic+keyword search over sample capabilities (§48). */
export function searchSample(q: string) {
  const s = new SearchEngine();
  s.indexMany([
    { id: 'm1', kind: 'model', title: 'Fast Local Coder', text: 'a local coding model for code tasks', tags: ['code'] },
    { id: 'p1', kind: 'plugin', title: 'PDF Reader', text: 'extract text and knowledge from pdf documents', tags: ['rag'] },
    { id: 'm2', kind: 'model', title: 'Cloud Writer', text: 'a cloud writing model for reports and documents', tags: ['writing'] },
  ]);
  return s.search(q);
}

export const SAMPLE_REQUEST =
  'Research solar EV charging, analyze these PDFs, create an engineering report, ' +
  'generate a diagram, build a dashboard, save everything, and remind me every Saturday.';

export function sampleModels(): ModelInfo[] {
  const m = (o: Partial<ModelInfo> & Pick<ModelInfo, 'id'>): ModelInfo => ({
    name: o.id,
    provider: o.local ? 'ollama' : 'openai-compat',
    runtime: o.local ? 'ollama' : 'openai-compat',
    contextWindow: 8000,
    costIn: 1,
    costOut: 1,
    latencyTier: 'medium',
    capabilities: [],
    available: true,
    local: false,
    ...o,
  });
  return [
    m({ id: 'research-model', capabilities: ['long-context'], costIn: 0.5, costOut: 0.5 }),
    m({ id: 'writer-model', capabilities: ['structured'], costIn: 1, costOut: 1 }),
    m({ id: 'coder-model', capabilities: ['code'], costIn: 2, costOut: 2 }),
    m({ id: 'local-model', local: true, runtime: 'ollama', capabilities: ['code', 'structured'], costIn: 0, costOut: 0, latencyTier: 'low' }),
    m({ id: 'fast-model', capabilities: ['creative'], costIn: 5, costOut: 5, latencyTier: 'low' }),
  ];
}

export function buildSampleCore(): OrchestrationCore {
  const core = new OrchestrationCore();
  core.registerModels(sampleModels());

  const tool = (
    id: string,
    permissions: string[],
    network: 'none' | 'optional' | 'required' = 'none',
    runtime: 'cloud' | 'local' = 'local',
  ): void => {
    core.registerCapability({
      id,
      version: '1.0',
      type: 'tool',
      provider: 'sample',
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

  tool('search', ['network.request'], 'required', 'cloud');
  tool('retrieve', ['network.request'], 'required', 'cloud');
  tool('rag', ['fs.read'], 'optional');
  tool('file.read', ['fs.read']);
  tool('writing', []);
  tool('studio', []);
  tool('coder', ['fs.write']);
  tool('terminal', ['terminal.exec']);
  tool('library.save', ['fs.write']);
  tool('schedule.create', ['fs.write']);
  return core;
}

export const sampleContext: CompatibilityContext = {
  offline: false,
  privacyMode: 'cloud',
  grantedPermissions: ['*'],
  availableHardware: ['cpu', 'gpu'],
};

/**
 * A demo executor that:
 *  - fails `report` once (transient) to show retry,
 *  - requires a permission for `schedule` (resolved via onPermissionRequired),
 *  - otherwise succeeds, returning a small artifact.
 */
export function demoExecutor(): NodeExecutor {
  const scheduleAttempts = { n: 0 };
  const reportAttempts = { n: 0 };
  return {
    async execute(node) {
      if (node.id === 'report') {
        if (reportAttempts.n++ < 1) throw new Error('transient model error');
        return { result: `# ${node.name}\nGenerated content for ${node.id}.`, evidence: ['source-1', 'source-2'] };
      }
      if (node.id === 'schedule') {
        if (scheduleAttempts.n++ < 1) {
          throw new NeedsPermissionError('needs write to create schedule', 'fs.write', 'high');
        }
      }
      return { result: `Output for ${node.name} (${node.id}).`, evidence: [`ev:${node.id}`] };
    },
  };
}
