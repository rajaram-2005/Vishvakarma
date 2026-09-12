// Lumen — which models are actually reachable from this surface,
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
    case 'aetherion-own':
      // Own-model family — on-device, always reachable, zero network.
      return true;
    case 'puter-cloud':
      // Reachable whenever Puter.js is loaded and the user is signed in —
      // the gateway bills the user's own Puter account (no API keys).
      return typeof window !== 'undefined' && !!(window as unknown as { puter?: unknown }).puter;
    case 'ollama':
      return !!settings.providers.ollamaUrl.trim();
    case 'openai-compat':
      return !!settings.providers.openaiBaseUrl.trim() && !!settings.providers.openaiApiKey.trim();
    default:
      // vLLM / SGLang / llama.cpp / Transformers / MLX / ONNX / TensorRT-LLM
      // run as local runtimes addressed through the Lumen API service
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
    case 'aetherion-own':
      // Served by the own-model registry directly (see lib/chat.ts) —
      // no network adapter exists or is needed.
      return null;
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
