import { describe, expect, it } from 'vitest';
import { BUILTIN_TOOLS, createGateway } from '@sutra/tool-adapters';

describe('tool registry', () => {
  it('declares the full builtin toolset', () => {
    const names = BUILTIN_TOOLS.map((t) => t.id);
    for (const expected of ['fs.read', 'terminal.exec', 'browser.nav', 'git.ops', 'api.fetch', 'db.query', 'code.exec', 'deploy.run']) {
      expect(names).toContain(expected);
    }
    for (const t of BUILTIN_TOOLS) {
      expect(t.risk).toMatch(/^(low|medium|high|critical)$/);
      expect(t.category).toBeTruthy();
    }
  });
});

describe('tool gateway', () => {
  const gw = createGateway();

  it('allows low-risk calls without approval', () => {
    const v = gw.check({ tool: 'fs.read', category: 'fs.read', detail: 'read src/x.ts' }, new Set());
    expect(v.allowed).toBe(true);
    expect(v.needsApproval).toBe(false);
    expect(v.risk).toBe('low');
  });

  it('blocks gated calls until a human approves', () => {
    const v = gw.check({ tool: 'terminal.exec', category: 'terminal.exec', detail: 'rm -rf /tmp/x' }, new Set());
    expect(v.allowed).toBe(false);
    expect(v.needsApproval).toBe(true);
  });

  it('honors session grants', () => {
    const session = new Set(['terminal.exec']);
    const v = gw.check({ tool: 'terminal.exec', category: 'terminal.exec', detail: 'npm test' }, session);
    expect(v.needsApproval).toBe(false);
  });

  it('never lets a session grant mask a critical signature', () => {
    // even with a terminal.exec grant, a critical signature must ask again
    const v = gw.check(
      { tool: 'terminal.exec', category: 'terminal.exec', detail: 'sudo rm -rf /' },
      new Set(['terminal.exec']),
    );
    expect(v.risk).toBe('critical');
    expect(v.needsApproval).toBe(true);
    expect(v.allowed).toBe(false);
  });

  it('marks deploys as critical with reasons', () => {
    const v = gw.check({ tool: 'deploy.run', category: 'deploy', detail: 'deploy bundle' }, new Set());
    expect(v.risk).toBe('critical');
    expect(v.reasons.length).toBeGreaterThan(0);
  });
});
