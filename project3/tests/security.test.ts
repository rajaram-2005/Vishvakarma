import { describe, expect, it } from 'vitest';
import { assess, scanForSecrets, DEFAULT_POLICY } from '@sutra/shared';

describe('assess', () => {
  it('keeps safe categories low-risk without approval', () => {
    const a = assess('fs.read');
    expect(a.risk).toBe('low');
    expect(a.requiresApproval).toBe(false);
  });

  it('escalates terminal commands matching dangerous signatures to critical', () => {
    const a = assess('terminal.exec', 'rm -rf / --no-preserve-root');
    expect(a.risk).toBe('critical');
    expect(a.requiresApproval).toBe(true);
    expect(a.reasons.join(' ')).toMatch(/recursive delete/);
  });

  it('flags force pushes', () => {
    const a = assess('git.push', 'git push origin main --force');
    expect(a.risk).toBe('critical');
    expect(a.requiresApproval).toBe(true);
  });

  it('flags sudo as privilege escalation', () => {
    const a = assess('terminal.exec', 'sudo apt install');
    expect(a.risk).toBe('critical');
  });

  it('keeps harmless commands at the baseline', () => {
    const a = assess('terminal.exec', 'npm test');
    expect(a.risk).toBe('medium');
    expect(a.requiresApproval).toBe(true); // terminal.exec always asks
  });

  it('deploy is always critical and gated', () => {
    const rule = DEFAULT_POLICY.find((p) => p.category === 'deploy');
    expect(rule?.risk).toBe('critical');
    expect(rule?.requiresApproval).toBe(true);
  });
});

describe('scanForSecrets', () => {
  it('finds an OpenAI-style key without echoing it', () => {
    const text = 'prefix line\nconst key = "sk-1234567890abcdefgh1234";\n';
    const out = scanForSecrets(text);
    expect(out.length).toBe(1);
    expect(out[0].line).toBe(2);
    expect(out[0].kind).toMatch(/key/i);
    const serialized = JSON.stringify(out);
    expect(serialized).not.toContain('sk-1234567890abcdefgh1234');
  });

  it('returns nothing for clean text', () => {
    expect(scanForSecrets('just some code, no secrets')).toHaveLength(0);
  });
});
