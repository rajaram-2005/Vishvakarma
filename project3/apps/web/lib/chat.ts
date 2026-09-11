// Aetherion — chat orchestration:
// Request → Router → Provider → Result (+ memory extraction, traces, activity)

import type { ChatMessage, MemoryEntry, ModelInfo, Settings } from '@sutra/shared';
import { uid } from '@sutra/shared';
import { route } from '@sutra/model-adapters';
import { providerFor, reachableModels } from './providers';
import { server, serverUsable, serverUrl } from './server';
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

function buildMessages(
  history: ChatMessage[],
  text: string,
): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
  const sys = history.filter((m) => m.role === 'system').map((m) => m.content).join('\n');
  const msgs: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];
  if (sys) msgs.push({ role: 'system', content: sys });
  for (const m of history.slice(-10)) msgs.push({ role: m.role, content: m.content });
  msgs.push({ role: 'user', content: text });
  return msgs;
}

function extractMemory(text: string): MemoryEntry | undefined {
  const rem = text.match(/remember\s+(?:that\s+)?(.+)/i);
  if (!rem) return undefined;
  return {
    id: uid('mem'),
    kind: 'fact',
    text: rem[1].trim().slice(0, 300),
    source: 'chat',
    ts: new Date().toISOString(),
  };
}

export async function sendChat(args: ChatSendArgs): Promise<ChatResult> {
  const { text, models, settings, forceModel, history, trace } = args;

  // ── Optional service layer ─────────────────────────────────────────────
  // Configured + non-local privacy mode → route through the Aetherion API.
  // Any failure (unreachable, HTTP, timeout) falls back to the local core
  // transparently, with an honest trace span. Local mode never reaches here.
  const baseUrl = serverUrl(settings);
  if (serverUsable(settings) && baseUrl) {
    const tSrv = Date.now();
    try {
      const out = await server.chat(baseUrl, {
        messages: buildMessages(history, text),
        modelId: forceModel,
        requireLocal: settings.privacyMode === 'hybrid',
        maxTokens: 1400,
      });
      trace.span('server.chat', Date.now() - tSrv, { model: out.model || 'sutra-local', via: baseUrl });
      const memory = extractMemory(text);
      trace.span('memory.extract', 1, { stored: memory ? 'yes' : 'no' });
      if (out.error) {
        return {
          content: `The Aetherion API stream returned an error: **${out.error}**\n\nCheck the service (Settings → Aetherion API). Nothing else was sent anywhere.`,
          modelId: out.model || 'sutra-local',
          modelName: out.model ? `${out.model} · via Aetherion API` : 'via Aetherion API',
          route: {
            analysis: `via Aetherion API${out.runtime ? ` (${out.runtime})` : ''}`,
            chosen: out.model || 'sutra-local',
            chosenName: out.model || 'sutra-local',
            reasons: out.reasons.length ? out.reasons : ['server routing'],
          },
          usedFallback: false,
          memory,
        };
      }
      return {
        content: out.content || '(empty response from the Aetherion API)',
        modelId: out.model || 'sutra-local',
        modelName: out.model ? `${out.model} · via Aetherion API` : 'via Aetherion API',
        route: {
          analysis: `via Aetherion API${out.runtime ? ` (${out.runtime})` : ''}`,
          chosen: out.model || 'sutra-local',
          chosenName: out.model || 'sutra-local',
          reasons: out.reasons.length ? out.reasons : ['server routing'],
        },
        usedFallback: false,
        memory,
      };
    } catch (e) {
      trace.span('server.chat', Date.now() - tSrv, { error: String(e).slice(0, 120) }, 'error');
      // fall through → local core (transparent, but traced)
    }
  }

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
  let modelName = decision.chosen?.name ?? 'Aetherion Local';

  // Puter AI gateway models are served by Puter directly, not by a browser
  // adapter. Requires the user to be signed in to Puter.
  const puterTarget = decision.chosen?.runtime === 'puter-cloud' ? decision.chosen : null;

  if (!provider) {
    provider = new (await import('@sutra/model-adapters')).SutraLocalProvider();
    usedFallback = true;
    modelId = 'sutra-local';
    modelName = 'Aetherion Local (fallback)';
  }

  const msgs = buildMessages(history, text);

  const tModel = Date.now();
  let content = '';
  if (puterTarget) {
    const { puterAiChat, puterSignedIn } = await import('@sutra/puter-adapter');
    if (puterSignedIn()) {
      const out = await puterAiChat(msgs, { model: puterTarget.id, temperature: 0.7, maxTokens: 1400 });
      if (out) {
        content = out.content;
        modelId = out.model;
        modelName = puterTarget.name;
        trace.span(`model.${puterTarget.id}`, Date.now() - tModel, { model: out.model, via: 'puter-gateway' });
      } else {
        trace.span(`model.${puterTarget.id}`, Date.now() - tModel, { error: 'gateway call failed' }, 'error');
        content =
          'The Puter gateway returned no answer for this model. Check the model id and your Puter account usage, or pick another model.';
      }
    } else {
      trace.span(`model.${puterTarget.id}`, Date.now() - tModel, { error: 'puter not signed in' }, 'error');
      content =
        'This model runs on the Puter AI gateway, which needs your Puter sign-in. Connect Puter in Settings → Puter (it bills your own Puter account — no API keys).';
    }
  } else {
    try {
      await provider.chat({ messages: msgs, temperature: 0.7, maxTokens: 1400 }, (c) => {
        if (!c.done && c.text) content += c.text;
      });
      trace.span(`model.${provider.id}`, Date.now() - tModel, { model: modelId });
    } catch (e) {
      const err = String((e as Error)?.message ?? e);
      trace.span(`model.${provider.id}`, Date.now() - tModel, { error: err }, 'error');
      content = `The model endpoint responded with an error: **${err}**\n\nI stayed safe: no partial data was sent anywhere else. If this is a local runtime, check that it is running; otherwise I can answer with Aetherion Local (Settings → Providers).`;
      usedFallback = true;
    }
  }

  const tMem = Date.now();
  const memory = extractMemory(text);
  trace.span('memory.extract', Date.now() - tMem, { stored: memory ? 'yes' : 'no' });

  const tFmt = Date.now();
  const finalContent = usedFallback && decision.chosen && decision.chosen.id !== 'sutra-local'
    ? `> ⚠️ ${decision.chosen.name} is not reachable from this surface right now — answered with Aetherion Local instead.\n\n${content}`
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
