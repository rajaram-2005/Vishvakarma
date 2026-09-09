import type { RouteAnalysis } from './types';

const CODE_RE =
  /```|function\s+\w+\s*\(|const\s+\w+\s*[:=]|def\s+\w+\s*\(|class\s+\w+|import\s+\w|SELECT\s|refactor|implement|bug|stack ?trace|regex|unit test/i;
const MATH_RE = /\d+\s*[\+\-\*\/\^%×]\s*\d+|\bcalculate\b|\bsolve\b|\bequation\b|\bintegral\b|\bderivative\b/i;
const CREATIVE_RE = /\bwrite\b|\bstory\b|\bpoem\b|\bname(s)?\s+(for|of)\b|\bcreative\b|\bslogan\b|\btagline\b|\blore\b/i;
const STRUCTURED_RE = /\bjson\b|\btable\b|\bextract\b|\bsummariz\w+|\blist (of|the)\b|\bcompare\b|\bplan\b/i;

/** Request → Task Analysis. Lightweight, deterministic, offline. */
export function analyzeRequest(text: string, needsLocal = false): RouteAnalysis {
  const intents: RouteAnalysis['intents'] = [];
  if (CODE_RE.test(text)) intents.push('code');
  if (MATH_RE.test(text)) intents.push('math');
  if (text.length > 6000) intents.push('long-context');
  if (CREATIVE_RE.test(text)) intents.push('creative');
  if (STRUCTURED_RE.test(text)) intents.push('structured');
  if (!intents.length) intents.push('general');
  return { intents, needsLocal, charCount: text.length, label: intents.join(' · ') };
}
