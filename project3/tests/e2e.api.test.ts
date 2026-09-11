// E2E: the web's server client (apps/web/lib/server) against a REAL running
// services/api (uvicorn). Skipped automatically when no API is reachable —
// run it with:  Aetherion_E2E_API=http://localhost:8000 npx vitest run tests/e2e.api.test.ts
// (start the API first: cd services/api && uvicorn app.main:app --port 8000)
import { describe, expect, it } from 'vitest';
import { server, serverUsable, serverUrl } from '../apps/web/lib/server';
import { SETTINGS } from './helpers';
import type { Settings } from '@sutra/shared';

const API = process.env.Aetherion_E2E_API;
const settings: Settings = { ...SETTINGS, privacyMode: 'hybrid', server: { baseUrl: API ?? '' } };

describe.skipIf(!API || !serverUsable(settings))('E2E web client ↔ services/api', () => {
  const b = serverUrl(settings)!;

  it('health', async () => {
    const h = await server.health(b);
    expect(h.service).toBe('sutra-api');
    expect(h.privacyMode).toBeTruthy();
  });

  it('models + route', async () => {
    const m = await server.models(b);
    expect(m.models.length).toBeGreaterThan(0);
    const r = await server.route(b, 'Refactor this function and fix the bug', false);
    expect(r.analysis.intents).toContain('code');
    expect(r.chosen).toBeTruthy();
  });

  it('chat streams over SSE with route frame', async () => {
    const out = await server.chat(b, {
      messages: [{ role: 'user', content: 'What is 17 × 23 + 5?' }],
      requireLocal: true,
    });
    expect(out.error).toBeNull();
    expect(out.model).toBeTruthy();
    expect(out.content.length).toBeGreaterThan(10);
    expect(out.content.toLowerCase()).toContain('396'); // 17*23=391 +5
  });

  it('security assess + scan (masked)', async () => {
    const a = await server.assess(b, 'terminal.exec', 'sudo rm -rf /');
    expect(a.risk).toBe('critical');
    expect(a.requiresApproval).toBe(true);
    const secret = 'sk-' + 'a1B2c3D4e5F6g7H8i9J0';
    const s = await server.scan(b, `const key = "${secret}";`);
    expect(s.clean).toBe(false);
    expect(s.findings[0].line).toBe(1);
    expect(JSON.stringify(s.findings)).not.toContain(secret); // never echoes the secret
  });

  it('workflow validate + topo + n8n export', async () => {
    const wf = {
      id: 'wf-e2e',
      name: 'e2e',
      description: '',
      trigger: 'manual',
      nodes: [
        { id: 'a', type: 'trigger', label: 'Start', config: {} },
        { id: 'b', type: 'ai', label: 'Think', config: { prompt: 'x' } },
      ],
      edges: [['a', 'b']],
      updatedAt: new Date().toISOString(),
    };
    const v = await server.validateWorkflow(b, wf);
    expect(v.valid).toBe(true);
    const t = await server.topo(b, wf);
    expect(t.order.indexOf('a')).toBeLessThan(t.order.indexOf('b'));
    const n = await server.toN8n(b, wf);
    expect((n as any).settings.executionOrder).toBe('v1');
    expect((n as any).connections.Start.main[0][0].node).toBe('Think');
  });

  it('deploy: clean bundle ok, secret bundle refused', async () => {
    const ok = await server.deployLocal(b, { name: 'e2e', files: { 'README.md': '# e2e' } });
    expect((ok as any).status).toBe('success');
    let refused = false;
    try {
      await server.deployLocal(b, { name: 'leak', files: { 'env.txt': 'OPENAI_API_KEY=sk-' + 'a'.repeat(24) } });
    } catch (e) {
      refused = String(e).includes('409') || JSON.stringify(e).includes('secrets_detected');
    }
    expect(refused).toBe(true);
  });
});
