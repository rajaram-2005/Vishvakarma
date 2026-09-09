import type { ModelInfo, Settings } from '@sutra/shared';

export const SETTINGS: Settings = {
  theme: 'dark',
  reducedMotion: 'system',
  ambientSound: false,
  ambientVolume: 0.2,
  privacyMode: 'local',
  syncScope: 'none',
  providers: {
    ollamaUrl: '',
    openaiBaseUrl: '',
    openaiApiKey: '',
    openaiModel: '',
    otlpEndpoint: '',
  },
};

export function model(p: Partial<ModelInfo> & { id: string }): ModelInfo {
  return {
    name: p.id,
    provider: 'sutra',
    runtime: 'sutra-local',
    contextWindow: 8192,
    costIn: 0,
    costOut: 0,
    latencyTier: 'low',
    capabilities: [],
    available: true,
    local: true,
    ...p,
  };
}

export const LOCAL = model({
  id: 'sutra-local',
  name: 'SUTRA Local',
  runtime: 'sutra-local',
  capabilities: ['code', 'structured'],
});

export const CODE_MODEL = model({
  id: 'coder-7b',
  name: 'Coder 7B',
  runtime: 'sutra-local',
  contextWindow: 131072,
  capabilities: ['code', 'structured'],
});
