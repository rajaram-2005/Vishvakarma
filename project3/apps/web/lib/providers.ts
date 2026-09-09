// SUTRA — which models are actually reachable from this surface,
// and which adapter serves them.

import type { ModelInfo, Settings } from '@sutra/shared';
import {
  OllamaProvider,
  OpenAICompatProvider,
  SutraLocalProvider,
  type ChatProvider,
} from '@sutra/model-adapters';

export function modelReachable(m: ModelInfo, settings: Settings): boolean {
  switch (m.runtime) {
    case 'sutra-local':
      return true;
    case 'ollama':
      return !!settings.providers.ollamaUrl.trim();
    case 'openai-compat':
      return !!settings.providers.openaiBaseUrl.trim() && !!settings.providers.openaiApiKey.trim();
    default:
      // vLLM / SGLang / llama.cpp / Transformers / MLX / ONNX / TensorRT-LLM
      // run as local runtimes addressed through the SUTRA API service
      // (services/api) or a direct adapter — not directly from the browser.
      return false;
  }
}

export function reachableModels(models: ModelInfo[], settings: Settings): ModelInfo[] {
  return models.filter((m) => modelReachable(m, settings));
}

/** Returns the adapter for a model, or null when it cannot be served here. */
export function providerFor(m: ModelInfo | null | undefined, settings: Settings): ChatProvider | null {
  if (!m) return null;
  switch (m.runtime) {
    case 'sutra-local':
      return new SutraLocalProvider();
    case 'ollama': {
      const url = settings.providers.ollamaUrl.trim();
      if (!url) return null;
      return new OllamaProvider(url, m.id, m);
    }
    case 'openai-compat': {
      const { openaiBaseUrl, openaiApiKey, openaiModel } = settings.providers;
      if (!openaiBaseUrl.trim() || !openaiApiKey.trim()) return null;
      return new OpenAICompatProvider(openaiBaseUrl, openaiApiKey, openaiModel.trim() || m.id, m);
    }
    default:
      return null;
  }
}
