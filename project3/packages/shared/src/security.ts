// SUTRA — security policy & risk engine.
// Agent → Tool Gateway → Policy → Sandbox → Execution.
// Dangerous operations are NEVER silent: they are classified, reasoned and
// (when policy says so) routed to a human approval queue.

import type { RiskLevel } from './types';

export type ToolCategory =
  | 'fs.read'
  | 'fs.write'
  | 'fs.delete'
  | 'terminal.exec'
  | 'network.request'
  | 'secret.read'
  | 'git.push'
  | 'db.write'
  | 'browser.action'
  | 'code.exec'
  | 'computer.use'
  | 'deploy';

export interface PolicyRule {
  category: ToolCategory;
  risk: RiskLevel;
  requiresApproval: boolean;
}

export const DEFAULT_POLICY: PolicyRule[] = [
  { category: 'fs.read', risk: 'low', requiresApproval: false },
  { category: 'fs.write', risk: 'low', requiresApproval: false },
  { category: 'fs.delete', risk: 'high', requiresApproval: true },
  { category: 'terminal.exec', risk: 'medium', requiresApproval: true },
  { category: 'network.request', risk: 'medium', requiresApproval: true },
  { category: 'secret.read', risk: 'critical', requiresApproval: true },
  { category: 'git.push', risk: 'medium', requiresApproval: true },
  { category: 'db.write', risk: 'high', requiresApproval: true },
  { category: 'browser.action', risk: 'medium', requiresApproval: false },
  { category: 'code.exec', risk: 'high', requiresApproval: true },
  { category: 'computer.use', risk: 'high', requiresApproval: true },
  { category: 'deploy', risk: 'critical', requiresApproval: true },
];

const RANK: Record<RiskLevel, number> = { low: 0, medium: 1, high: 2, critical: 3 };
export const RISK_RANK = RANK;

export function maxRisk(a: RiskLevel, b: RiskLevel): RiskLevel {
  return RANK[a] >= RANK[b] ? a : b;
}

export interface RiskAssessment {
  risk: RiskLevel;
  requiresApproval: boolean;
  reasons: string[];
  category: ToolCategory;
}

const DANGEROUS: Array<[RegExp, string]> = [
  [/\brm\s+(-[a-z]*[rf][a-z]*\s+)+/i, 'recursive delete'],
  [/\bsudo\b/i, 'privilege escalation'],
  [/\bmkfs\b|\bdd\s+if=/i, 'disk-level write'],
  [/\bchmod\s+(-R\s+)?777\b/i, 'world-writable permissions'],
  [/: *\(\) *\{.*\|.*& *\}/, 'fork bomb pattern'],
  [/\bcurl\b[^\n|]*\|\s*(ba|z)?sh/i, 'remote script piped to shell'],
  [/\bwget\b[^\n|]*\|\s*(ba|z)?sh/i, 'remote script piped to shell'],
  [/\bbase64\s+(-d|--decode)/i, 'encoded payload decode'],
  [/\bgit\s+push\b[^\n]*--force\b|\bgit\s+push\b[^\n]*\s-f\b/i, 'force push'],
  [/\beval\b\s*\(/i, 'dynamic code evaluation'],
  [/\bDROP\s+(TABLE|DATABASE|SCHEMA)\b/i, 'destructive SQL'],
  [/\bTRUNCATE\s+TABLE\b/i, 'destructive SQL'],
  [/\bnc\s+-e\b|\bnetcat\b.*\b-e\b/i, 'reverse shell pattern'],
  [/\/etc\/(passwd|shadow)/i, 'credential file access'],
];

export function assess(
  category: ToolCategory,
  detail = '',
  policy: PolicyRule[] = DEFAULT_POLICY,
): RiskAssessment {
  const rule =
    policy.find((p) => p.category === category) ?? { category, risk: 'medium' as RiskLevel, requiresApproval: true };
  let risk = rule.risk;
  const reasons: string[] = [`${category}: baseline ${rule.risk}`];
  if (detail) {
    for (const [re, why] of DANGEROUS) {
      if (re.test(detail)) {
        risk = 'critical';
        reasons.push(`signature: ${why}`);
        break;
      }
    }
  }
  const requiresApproval = rule.requiresApproval || risk === 'critical' || risk === 'high';
  return { risk, requiresApproval, reasons, category };
}

/** Scans text for likely secrets. Returns findings (never returns the secret itself). */
export function scanForSecrets(text: string): Array<{ file: string; line: number; kind: string }> {
  const out: Array<{ file: string; line: number; kind: string }> = [];
  const patterns: Array<[RegExp, string]> = [
    [/sk-[a-zA-Z0-9]{16,}/, 'OpenAI-style API key'],
    [/ghp_[a-zA-Z0-9]{20,}/, 'GitHub personal access token'],
    [/xox[baprs]-[a-zA-Z0-9-]{10,}/, 'Slack token'],
    [/AKIA[0-9A-Z]{16}/, 'AWS access key id'],
    [/-----BEGIN (RSA|EC|OPENSSH) PRIVATE KEY-----/, 'private key material'],
    [/(password|passwd|pwd)\s*[:=]\s*['"][^'"]{4,}['"]/i, 'hardcoded password'],
    [/api[_-]?key\s*[:=]\s*['"][^'"]{8,}['"]/i, 'hardcoded API key'],
  ];
  text.split('\n').forEach((ln, i) => {
    for (const [re, kind] of patterns) {
      if (re.test(ln)) out.push({ file: 'text', line: i + 1, kind });
    }
  });
  return out;
}
