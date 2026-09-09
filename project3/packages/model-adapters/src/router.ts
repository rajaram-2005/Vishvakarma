import type { ModelInfo } from '@sutra/shared';
import { analyzeRequest } from './analyze';
import type { RankEntry, RouteAnalysis, RouteDecision } from './types';

const CAP_BY_INTENT: Record<string, ModelInfo['capabilities'][number]> = {
  code: 'code',
  math: 'math',
  'long-context': 'long-context',
  creative: 'creative',
  structured: 'structured',
  general: 'structured',
};

export function rankModels(
  models: ModelInfo[],
  analysis: RouteAnalysis,
  opts: { requireLocal?: boolean } = {},
): RankEntry[] {
  const entries: RankEntry[] = [];
  for (const m of models) {
    if (!m.available) continue;
    if (opts.requireLocal && !m.local) continue;
    let score = 50;
    const reasons: string[] = [];
    for (const intent of analysis.intents) {
      const cap = CAP_BY_INTENT[intent];
      if (cap && m.capabilities.includes(cap)) {
        score += 12;
        reasons.push(`matches ${intent}`);
      }
    }
    const lat = { low: 10, medium: 4, high: -4 }[m.latencyTier];
    score += lat;
    if (lat > 0) reasons.push('fast tier');
    if (analysis.charCount > m.contextWindow * 0.5) {
      score -= 15;
      reasons.push('context window tight');
    } else if (m.contextWindow >= 32000) {
      score += 4;
      reasons.push('wide context');
    }
    const costScore = m.costIn === 0 ? 8 : m.costIn < 0.5 ? 4 : 0;
    score += costScore;
    if (costScore) reasons.push(m.costIn === 0 ? 'zero cost' : 'low cost');
    if (m.local) {
      score += 3;
      reasons.push('runs on your machine');
    }
    entries.push({ modelId: m.id, score, reasons: reasons.slice(0, 4) });
  }
  return entries.sort((a, b) => b.score - a.score);
}

/** Request → Task Analysis → Model Ranking → Model. */
export function route(
  models: ModelInfo[],
  text: string,
  opts: { requireLocal?: boolean; forceModel?: string } = {},
): RouteDecision {
  const analysis = analyzeRequest(text, !!opts.requireLocal);
  const ranking = rankModels(models, analysis, opts);
  let chosen: ModelInfo | null = null;
  if (opts.forceModel) {
    chosen = models.find((m) => m.id === opts.forceModel && m.available) ?? null;
    if (chosen) {
      const forced: RankEntry = { modelId: chosen.id, score: 100, reasons: ['pinned by user'] };
      ranking.unshift(forced);
    }
  } else {
    chosen = models.find((m) => m.id === ranking[0]?.modelId) ?? models.find((m) => m.available) ?? null;
  }
  return { analysis, ranking: ranking.slice(0, 6), chosen };
}
