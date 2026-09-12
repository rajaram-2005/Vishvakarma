// §77 — Explainability. For important automated choices, answer
// "Why did you choose this model?" with task type, capabilities, context,
// hardware, privacy, latency, cost and availability.

import { selectModel } from './router';
import type { ModelInfo, RoutingContext, RoutingMode } from './types';

export interface ModelChoiceExplanation {
  chosen: ModelInfo | null;
  mode: RoutingMode;
  taskType: string;
  capabilities: string[];
  context: { offline: boolean; privacyMode: string; hardware: string[] };
  hardware: string;
  privacy: string;
  latencyTier: string;
  costPer1k: number;
  availability: string;
  reasons: string[];
}

function taskTypeOf(text: string): string {
  const t = text.toLowerCase();
  if (/\b(code|refactor|bug|function|implement)\b/.test(t)) return 'code';
  if (/\b(math|calculate|solve|equation)\b/.test(t)) return 'math';
  if (/\b(write|story|poem|creative)\b/.test(t)) return 'creative';
  if (/\b(json|table|extract|summar|list|plan)\b/.test(t)) return 'structured';
  if (t.length > 6000) return 'long-context';
  return 'general';
}

export function explainModelChoice(
  models: ModelInfo[],
  mode: RoutingMode,
  text: string,
  ctx: RoutingContext = {},
): ModelChoiceExplanation {
  const chosen = selectModel(models, mode, { ...ctx, text });
  const reasons: string[] = [];
  if (chosen) {
    reasons.push(`selected for mode '${mode}'`);
    reasons.push(`matches task type '${taskTypeOf(text)}'`);
    if (chosen.local) reasons.push('runs locally (privacy + offline friendly)');
    if (chosen.latencyTier === 'low') reasons.push('low latency tier');
    const cost = chosen.costIn + chosen.costOut;
    reasons.push(cost === 0 ? 'zero marginal cost' : `cost ${cost.toFixed(2)}/1k tokens`);
    if (ctx.privacyMode === 'local' && !chosen.local) reasons.push('note: privacy mode allows cloud');
  } else {
    reasons.push('no compatible model available for the current context');
  }
  return {
    chosen,
    mode,
    taskType: taskTypeOf(text),
    capabilities: chosen?.capabilities ?? [],
    context: {
      offline: !!ctx.offline,
      privacyMode: ctx.privacyMode ?? 'cloud',
      hardware: ctx.priorities as unknown as string[] ?? [],
    },
    hardware: chosen?.local ? 'local' : 'cloud',
    privacy: chosen?.local ? 'local-only' : 'cloud-ok',
    latencyTier: chosen?.latencyTier ?? 'n/a',
    costPer1k: chosen ? chosen.costIn + chosen.costOut : 0,
    availability: chosen?.available ? 'available' : 'unavailable',
    reasons,
  };
}
