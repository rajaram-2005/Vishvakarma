// SUTRA — chat orchestration:
// Request → Router → Provider → Result (+ memory extraction, traces, activity)

import type { ChatMessage, MemoryEntry, ModelInfo, Settings } from '@sutra/shared';
import { uid } from '@sutra/shared';
import { route } from '@sutra/model-adapters';
import { providerFor, reachableModels } from './providers';
import type { Tracer } from './store';

export interface ChatSendArgs {
  text: string;
  models: ModelInfo[];
  settings: Settings;
  forceModel?: string;
  history: ChatMessage[];
  trace: Tracer;
}

export interface ChatResult {
  content: string;
  modelId: string;
  modelName: string;
  route: { analysis: string; chosen: string; chosenName: string; reasons: string[] };
  usedFallback: boolean;
  memory?: MemoryEntry;
}

export async function sendChat(args: ChatSendArgs): Promise<ChatResult> {
  const { text, models, settings, forceModel, history, trace } = args;

  const tRoute = Date.now();
  const pool = reachableModels(models, settings);
  const decision = route(pool.length ? pool : models, text, {
    requireLocal: settings.privacyMode === 'local',
    forceModel,
  });
  trace.span('router.decide', Date.now() - tRoute, {
    intents: decision.analysis.label,
    candidates: String(decision.ranking.length),
    chosen: decision.chosen?.id ?? 'none',
  });

  let provider = decision.chosen ? providerFor(decision.chosen, settings) : null;
  let usedFallback = false;
  let modelId = decision.chosen?.id ?? 'sutra-local';
  let modelName = decision.chosen?.name ?? 'Sutra Local';
  if (!provider) {
    provider = new (await import('@sutra/model-adapters')).SutraLocalProvider();
    usedFallback = true;
    modelId = 'sutra-local';
    modelName = 'Sutra Local (fallback)';
  }

  const sys = history
    .filter((m) => m.role === 'system')
    .map((m) => m.content)
    .join('\n');
  const msgs: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];
  if (sys) msgs.push({ role: 'system', content: sys });
  for (const m of history.slice(-10)) msgs.push({ role: m.role, content: m.content });
  msgs.push({ role: 'user', content: text });

  const tModel = Date.now();
  let content = '';
  try {
    await provider.chat({ messages: msgs, temperature: 0.7, maxTokens: 1400 }, (c) => {
      if (!c.done && c.text) content += c.text;
    });
    trace.span(`model.${provider.id}`, Date.now() - tModel, { model: modelId });
  } catch (e) {
    const err = String((e as Error)?.message ?? e);
    trace.span(`model.${provider.id}`, Date.now() - tModel, { error: err }, 'error');
    content = `The model endpoint responded with an error: **${err}**\n\nI stayed safe: no partial data was sent anywhere else. If this is a local runtime, check that it is running; otherwise I can answer with SUTRA Local (Settings → Providers).`;
    usedFallback = true;
  }

  const tMem = Date.now();
  let memory: MemoryEntry | undefined;
  const rem = text.match(/remember\s+(?:that\s+)?(.+)/i);
  if (rem) {
    memory = {
      id: uid('mem'),
      kind: 'fact',
      text: rem[1].trim().slice(0, 300),
      source: 'chat',
      ts: new Date().toISOString(),
    };
  }
  trace.span('memory.extract', Date.now() - tMem, { stored: memory ? 'yes' : 'no' });

  const tFmt = Date.now();
  const finalContent = usedFallback && decision.chosen && decision.chosen.id !== 'sutra-local'
    ? `> ⚠️ ${decision.chosen.name} is not reachable from this surface right now — answered with SUTRA Local instead.\n\n${content}`
    : content;
  trace.span('response.format', Date.now() - tFmt, { chars: String(finalContent.length) });

  return {
    content: finalContent,
    modelId,
    modelName,
    route: {
      analysis: decision.analysis.label,
      chosen: modelId,
      chosenName: modelName,
      reasons: decision.chosen ? decision.ranking.find((r) => r.modelId === modelId)?.reasons ?? [] : ['local fallback'],
    },
    usedFallback,
    memory,
  };
}
