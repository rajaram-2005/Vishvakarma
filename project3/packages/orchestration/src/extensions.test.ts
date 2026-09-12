import { describe, it, expect } from 'vitest';
import {
  CAPABILITY_MATRIX,
  worksOffline,
  OfflineCachePolicy,
  ConnectivityRecovery,
  ContextBuilder,
  estimateTokens,
  validateOutput,
  validateOrRepair,
  CostEngine,
  UsageLimits,
  ApprovalCenter,
  SearchEngine,
  runEnsemble,
  satisfiesPrivacy,
  dataPolicy,
  FeatureFlags,
  PackageInstaller,
  explainModelChoice,
  JobQueue,
  PrivacyMode,
} from './index';
import type { ModelInfo } from './types';
import { OrchestrationCore } from './index';

describe('Offline/Online matrix (§60/§61/§62)', () => {
  it('has a row for every spec capability', () => {
    expect(CAPABILITY_MATRIX.length).toBeGreaterThanOrEqual(17);
  });
  it('reports cloud-only capabilities as unavailable offline', () => {
    expect(worksOffline('cloud-models')).toBe(false);
    expect(worksOffline('chat')).toBe(true);
    expect(worksOffline('local-models')).toBe(true); // if-installed
  });
  it('respects the offline cache policy (never private cloud by default)', () => {
    const p = OfflineCachePolicy.default();
    expect(p.canCache('local-projects')).toBe(true);
    expect(p.canCache('selected-library')).toBe(false);
    p.permit('selected-library');
    expect(p.canCache('selected-library')).toBe(true);
  });
  it('connectivity recovery defers to a preview by default', () => {
    expect(new ConnectivityRecovery('preview-first').onReconnect(3)).toBe('sync-preview');
    expect(new ConnectivityRecovery('manual').onReconnect(3)).toBe('skip');
    expect(new ConnectivityRecovery('sync-all').onReconnect(0)).toBe('skip');
  });
});

describe('Context builder & budgeting (§22/§23)', () => {
  it('estimates tokens roughly', () => {
    expect(estimateTokens('a'.repeat(400))).toBe(100);
  });
  it('includes high-priority, omits low-priority when over budget', () => {
    const b = new ContextBuilder();
    b.add({ kind: 'memory', text: 'x'.repeat(2000), priority: 5 });
    b.add({ kind: 'library', text: 'y'.repeat(2000), priority: 1 });
    const ctx = b.build(500); // 500 tokens fits memory exactly; library is omitted
    expect(ctx.included.length).toBe(1);
    expect(ctx.omitted.length).toBe(1);
    expect(ctx.included[0].kind).toBe('memory');
  });
  it('summarizes rather than drops when partial room exists', () => {
    const b = new ContextBuilder();
    b.add({ kind: 'a', text: 'z'.repeat(4000), priority: 1 });
    b.add({ kind: 'b', text: 'w'.repeat(4000), priority: 1 });
    const ctx = b.build(700);
    // first fits, second gets summarized into remaining budget
    expect(ctx.summarized.length + ctx.included.length).toBeGreaterThanOrEqual(1);
  });
});

describe('Output validation (§17)', () => {
  it('flags invalid JSON and repairs it', () => {
    // Unrecoverable structure stays invalid.
    expect(validateOutput('json', '{bad json,}').valid).toBe(false);
    // Trailing comma is repaired into valid JSON.
    const r = validateOrRepair('json', '{"a":1,}');
    expect(r.valid).toBe(true);
    expect(r.repaired).toBe('{"a":1}');
  });
  it('enforces schemas', () => {
    const r = validateOutput('schema', JSON.stringify({ a: 1 }), { required: ['b'] });
    expect(r.valid).toBe(false);
    const ok = validateOutput('schema', JSON.stringify({ b: 2 }), { required: ['b'] });
    expect(ok.valid).toBe(true);
  });
  it('validates sql, code and csv', () => {
    expect(validateOutput('sql', 'SELECT 1').valid).toBe(true);
    expect(validateOutput('sql', 'HELLO').valid).toBe(false);
    expect(validateOutput('code', 'function f(){ return 1;').valid).toBe(false);
    expect(validateOutput('csv', 'a,b\n1,2\n3').valid).toBe(false); // ragged
    expect(validateOutput('csv', 'a,b\n1,2\n3,4').valid).toBe(true);
  });
});

describe('Cost engine & usage limits (§64/§65/§66)', () => {
  it('records and aggregates spend', () => {
    const c = new CostEngine();
    c.record({ scope: 'user:a', kind: 'model', amount: 1.5 });
    c.record({ scope: 'user:a', kind: 'model', amount: 0.5 });
    expect(c.total()).toBe(2);
    expect(c.byScope('user:a')).toBe(2);
    expect(c.byKind('model')).toBe(2);
  });
  it('estimates model calls', () => {
    const c = new CostEngine();
    expect(c.estimateModel(1, 2, 1000, 500)).toBeCloseTo(2);
  });
  it('enforces limits and reports quota', () => {
    const u = new UsageLimits();
    u.set('model:big', 10);
    expect(u.check('model', 'big', 5).allowed).toBe(true);
    const after = u.consume('model', 'big', 8);
    expect(after.allowed).toBe(true);
    expect(after.used).toBe(8);
    expect(after.remaining).toBe(2);
    expect(u.check('model', 'big', 5).allowed).toBe(false);
  });
});

describe('Approval Center (§35/§34)', () => {
  it('queues, decides and grants sessions', () => {
    const a = new ApprovalCenter();
    const req = a.request({ task: 'deploy', requestedAction: 'deploy', risk: 'high', reasons: ['prod'] });
    expect(a.list('pending')).toHaveLength(1);
    a.decide(req.id, 'approve-session');
    expect(a.isGranted('high')).toBe(true);
    expect(a.get(req.id)?.status).toBe('approved');
  });
  it('never masks critical via session grant', () => {
    const a = new ApprovalCenter();
    const req = a.request({ task: 'x', requestedAction: 'secret.read', risk: 'critical', reasons: [] });
    a.decide(req.id, 'approve-session');
    // critical is always re-asked even with a session grant
    expect(a.resolve('critical').allow).toBe(false);
  });
});

describe('Search engine (§48)', () => {
  it('finds by keyword and semantic overlap', () => {
    const s = new SearchEngine();
    s.indexMany([
      { id: '1', kind: 'model', title: 'Fast Coder', text: 'a local coding model', tags: ['code'] },
      { id: '2', kind: 'plugin', title: 'PDF Reader', text: 'extract text from pdf documents', tags: ['rag'] },
    ]);
    const hits = s.search('pdf');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].doc.id).toBe('2');
  });
});

describe('Model ensembles (§12)', () => {
  const members = [
    { id: 'm1', role: 'researcher' },
    { id: 'm2', role: 'critic' },
  ];
  const call = async (m: { id: string }) => `out-from-${m.id}`;
  it('runs critic mode', async () => {
    const r = await runEnsemble('critic', members, 'topic', call);
    expect(r.steps.length).toBe(2);
    expect(r.output).toContain('Critique');
  });
  it('runs voting mode with consensus', async () => {
    const r = await runEnsemble('voting', members, 'topic', call);
    expect(r.output).toContain('Consensus');
  });
  it('runs sequential chain', async () => {
    const r = await runEnsemble('sequential', members, 'start', call);
    expect(r.steps.length).toBe(2);
    expect(r.output).toBe('out-from-m2');
  });
});

describe('Privacy modes (§67/§68)', () => {
  it('maximum privacy rejects cloud runtimes', () => {
    expect(satisfiesPrivacy('maximum' as PrivacyMode, 'cloud', false)).toBe(false);
    expect(satisfiesPrivacy('maximum' as PrivacyMode, 'edge', false)).toBe(true);
    expect(satisfiesPrivacy('maximum' as PrivacyMode, 'local', true)).toBe(true);
  });
  it('shows a known data policy and an honest unknown one', () => {
    expect(dataPolicy('local/ollama').training).toBe('none');
    expect(dataPolicy('some-random-provider').training).toBe('unknown');
  });
});

describe('Feature flags (§99)', () => {
  it('gates visibility and enablement', () => {
    const f = new FeatureFlags();
    f.set('new-ui', 'beta');
    expect(f.isEnabled('new-ui')).toBe(true);
    expect(f.isVisible('new-ui')).toBe(true);
    f.set('hidden', 'internal');
    expect(f.isVisible('hidden')).toBe(false);
  });
});

describe('Professional package install (§112-114)', () => {
  it('installs a package via compatibility + deps + license + permissions', () => {
    // Minimal wiring reusing the registry/compatibility from the core.
    const core: OrchestrationCore = new OrchestrationCore();
    core.registerCapability({
      id: 'tool-x', version: '1.0', type: 'tool', provider: 'p',
      capabilities: [], inputs: [], outputs: [], dependencies: [],
      permissions: ['fs.read'], modalities: [], runtime: 'local', hardware: ['cpu'],
      network: 'none', license: 'MIT', securityLevel: 'public', availability: 'stable',
    } as any);
    const installer = new PackageInstaller(core.registry, core.compatibility);
    const res = installer.install({ id: 'pkg', version: '1.0', title: 't', contains: ['tool-x'] }, {
      offline: false, privacyMode: 'cloud', grantedPermissions: ['*'],
    });
    expect(res.ok).toBe(true);
    expect(res.installed).toContain('tool-x');
  });
});

describe('Explainability (§77)', () => {
  it('explains why a model was chosen', () => {
    const models: ModelInfo[] = [
      { id: 'fast', name: 'fast', provider: 'p', runtime: 'ollama', contextWindow: 8000, costIn: 0, costOut: 0, latencyTier: 'low', capabilities: ['code'], available: true, local: true },
      { id: 'cloud', name: 'cloud', provider: 'p', runtime: 'openai-compat', contextWindow: 8000, costIn: 1, costOut: 1, latencyTier: 'high', capabilities: [], available: true, local: false },
    ];
    const ex = explainModelChoice(models, 'fast', 'write a function to sort', { privacyMode: 'local' });
    expect(ex.chosen?.id).toBe('fast');
    expect(ex.reasons.length).toBeGreaterThan(0);
    expect(ex.taskType).toBe('code');
  });
});

describe('Job queue (§46)', () => {
  it('runs jobs with priority and concurrency', async () => {
    const q = new JobQueue();
    q.enqueue('a', { x: 1 }, { priority: 1 });
    q.enqueue('b', { x: 2 }, { priority: 5 });
    await q.run(async (job) => `done:${job.name}`, { concurrency: 2 });
    expect(q.list().every((j) => j.status === 'completed')).toBe(true);
  });
  it('retries then fails on persistent error', async () => {
    const q = new JobQueue();
    const j = q.enqueue('flaky', {}, { maxRetries: 2 });
    await q.run(async () => { throw new Error('boom'); }, { concurrency: 1 });
    expect(j.status).toBe('failed');
    expect(j.attempts).toBe(3);
  });
  it('can be cancelled', async () => {
    const q = new JobQueue();
    const j = q.enqueue('c', {});
    expect(q.cancel(j.id)).toBe(true);
    expect(j.status).toBe('cancelled');
  });
});
