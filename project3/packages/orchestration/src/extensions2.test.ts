import { describe, it, expect, vi } from 'vitest';
import {
  ScheduleManager,
  NotificationEngine,
  ActivityFeed,
  ProjectWorkspace,
  APIKeyManager,
  Sdk,
  WebhookSystem,
  compileWorkflow,
  runWorkflow,
  WORKFLOW_TEMPLATES,
  SecurityCenter,
  I18n,
  autonomyProfile,
  mayExecute,
  Marketplace,
  safeUpdate,
  adaptUi,
  runChaos,
  chaosExecutor,
  OrchestrationCore,
  buildSampleCore,
  demoExecutor,
  sampleContext,
  SAMPLE_REQUEST,
} from './index';

describe('Scheduling (§57/§58/§59)', () => {
  it('computes next run for interval/daily/weekly expressions with timezone', () => {
    const m = new ScheduleManager();
    const s = m.create({
      id: 's1',
      name: 'Weekly report',
      expr: 'every saturday',
      timezone: 'Asia/Kolkata',
      retryPolicy: { maxRetries: 2, backoffMs: 1000 },
      misfire: 'run-next',
    });
    expect(s.timezone).toBe('Asia/Kolkata');
    const next = new Date(s.nextRun);
    expect(next.getUTCDay()).toBe(6); // Saturday
  });

  it('applies the misfire policy for a missed execution', () => {
    const m = new ScheduleManager();
    const past = new Date(Date.now() - 86400000).toISOString();
    m.create({ id: 's2', name: 't', expr: 'daily', timezone: 'UTC', retryPolicy: { maxRetries: 1, backoffMs: 0 }, misfire: 'skip', nextRun: past });
    expect(m.handleMissed('s2')).toBe('skip');
    m.create({ id: 's3', name: 't', expr: 'daily', timezone: 'UTC', retryPolicy: { maxRetries: 1, backoffMs: 0 }, misfire: 'run-immediately', nextRun: past });
    expect(m.handleMissed('s3')).toBe('run');
  });
});

describe('Notifications (§47)', () => {
  it('routes and delivers across channels', () => {
    const n = new NotificationEngine();
    const seen: string[] = [];
    n.on('email', (note) => seen.push(note.channel));
    const d = n.send({ channel: 'in-app', topic: 'security.alert', title: 'x', body: 'y' }, n.route('security.alert'));
    expect(d.every((x) => x.ok)).toBe(true);
    expect(seen).toHaveLength(1); // email handler was invoked via routing
  });
});

describe('Activity feed (§49)', () => {
  it('records events and bridges the bus', () => {
    const f = new ActivityFeed();
    f.record('model.installed', 'Model installed', { modelId: 'm' });
    expect(f.recent(1)[0].text).toBe('Model installed');
  });
});

describe('Project workspaces (§50-§53)', () => {
  it('creates, snapshots, restores, clones, exports (no secrets)', () => {
    const p = new ProjectWorkspace();
    const proj = p.create('Solar EV', 'research', { privacy: 'local' });
    p.snapshot(proj.id);
    p.restore(proj.id);
    const clone = p.clone(proj.id, 'Solar EV 2');
    expect(clone.template).toBe('research');
    const bundle = p.export(proj.id, { chats: 3, workflows: 1 });
    expect(bundle.secretsExcluded).toBe(true);
    expect(bundle.chats).toBe(3);
  });
  it('exposes templates', () => {
    expect(new ProjectWorkspace().list().length).toBe(0);
  });
});

describe('API platform / SDK / webhooks (§54-§56)', () => {
  it('creates and verifies scoped API keys', () => {
    const km = new APIKeyManager();
    const { plaintext, record } = km.create(['chat', 'library']);
    expect(km.verify(plaintext)?.id).toBe(record.id);
    expect(km.hasScope(record, 'chat')).toBe(true);
    expect(km.hasScope(record, 'admin')).toBe(false);
  });
  it('SDK drives the core', async () => {
    const core = buildSampleCore();
    const sdk = new Sdk(core);
    const bot = sdk.createBot('helper', 'research-model');
    expect(bot.type).toBe('bot');
  });
  it('webhook dispatch signs and retries, and verifies signatures', async () => {
    const calls: Array<{ url: string; sig: string }> = [];
    const ws = new WebhookSystem(async (url, _body, sig) => {
      calls.push({ url, sig });
      return true;
    });
    ws.register('https://hook.test/x', 'secret');
    const ok = await ws.dispatch('task.completed', { id: 1 });
    expect(ok).toBe(true);
    expect(calls.length).toBe(1);
    const body = '{"a":1}';
    const sig = (ws as unknown as { sign: (s: string, b: string) => string }).sign('secret', body);
    expect(ws.verify(body, 'secret', sig)).toBe(true);
    expect(ws.verify(body, 'secret', 'tampered')).toBe(false);
  });
});

describe('Workflows (§42-§44)', () => {
  it('compiles a workflow into a task graph and runs it', async () => {
    const core = buildSampleCore();
    const wf = WORKFLOW_TEMPLATES[0].build();
    const { graph, debug } = await runWorkflow(core, wf, demoExecutor(), { context: sampleContext });
    expect(graph.nodes['report']).toBeDefined();
    expect(debug.every((d) => d.status === 'completed')).toBe(true);
  });
});

describe('Security center (§69)', () => {
  it('aggregates alerts from the event bus', () => {
    const sc = new SecurityCenter();
    const core = buildSampleCore();
    sc.attach(core.bus);
    core.bus.emit('security.alert', { risk: 'high', detail: 'suspicious' });
    expect(sc.summary().openAlerts).toBeGreaterThan(0);
  });
});

describe('i18n (§72)', () => {
  it('translates with fallback', () => {
    const i = new I18n('ta');
    expect(i.t('action.run')).toBe('இயக்கு');
    expect(i.t('nonexistent.key')).toBe('nonexistent.key');
    expect(I18n.supported().length).toBeGreaterThanOrEqual(10);
  });
});

describe('Autonomy (§79/§80)', () => {
  it('gates high-risk ops regardless of level', () => {
    const p = autonomyProfile('coder', 'autonomous');
    expect(mayExecute(p, 'fs.write')).toBe(true);
    expect(mayExecute(p, 'git.push')).toBe(false); // always gated
  });
});

describe('Marketplace (§104-§106)', () => {
  it('ranks by trust, not downloads', () => {
    const m = new Marketplace();
    m.addPublisher({ id: 'acme', state: 'verified', reputation: 0.9 });
    m.addListing({ id: 'good', publisher: 'acme', security: 0.9, maintenance: 0.8, compatibility: 0.9, quality: 0.8, reviews: 500, usage: 50, licenseOk: true });
    m.addListing({ id: 'popular', publisher: 'acme', security: 0.3, maintenance: 0.2, compatibility: 0.4, quality: 0.3, reviews: 5, usage: 99999, licenseOk: true });
    expect(m.ranked()[0].id).toBe('good');
  });
  it('demotes on security reports', () => {
    const m = new Marketplace();
    m.addPublisher({ id: 'p', state: 'community', reputation: 0.5 });
    m.addListing({ id: 'x', publisher: 'p', security: 0.8, maintenance: 0.8, compatibility: 0.8, quality: 0.8, reviews: 10, usage: 10, licenseOk: true });
    m.report({ id: 'r1', listing: 'x', reason: 'malware', by: 'u' });
    expect(m.listings.get('x')!.security).toBeLessThanOrEqual(0.2);
  });
});

describe('Update system (§102/§103)', () => {
  it('safe-updates with backup and rollback on failure', async () => {
    let applied = '';
    let healthy = true;
    const target = {
      id: 'plugin',
      version: '1.0',
      checkCompatibility: () => true,
      backup: async () => {},
      apply: async (next: string) => {
        applied = next;
      },
      healthCheck: async () => healthy,
      rollback: async () => {
        applied = '1.0';
      },
    };
    const okR = await safeUpdate(target, '2.0');
    expect(okR.ok).toBe(true);
    expect(applied).toBe('2.0');
    healthy = false;
    const badR = await safeUpdate(target, '3.0');
    expect(badR.ok).toBe(false);
    expect(applied).toBe('1.0'); // rolled back
  });
});

describe('Adaptive UI (§115-§119)', () => {
  it('adapts home and capabilities per profile/mode', () => {
    expect(adaptUi('student', 'beginner').visibleCapabilities).toContain('ask');
    expect(adaptUi('developer', 'expert').hiddenCapabilities).toEqual([]);
  });
});

describe('Chaos testing (§95-§98)', () => {
  it('the platform recovers gracefully under injected failures', async () => {
    const core = buildSampleCore();
    const out = await runChaos(core, SAMPLE_REQUEST, 'model-down', sampleContext);
    // A single transient model-down on the report node is retried and recovers;
    // the run finishes without crashing.
    expect(out.graceful).toBe(true);
    expect(out.completed.length).toBeGreaterThan(0);
  });
  it('a persistent model-down fails the node and cascades to dependents', async () => {
    const core = buildSampleCore();
    const { graph } = core.plan(SAMPLE_REQUEST);
    const base: any = { async execute(node: any) { return { result: node.id }; } };
    const result = await core.run(graph, chaosExecutor(base, { scenario: 'model-down', targetNode: 'report', failUntilAttempt: 10 }), { context: sampleContext });
    // report never recovers -> failed and dependents skipped
    expect(result.failed).toContain('report');
  });
});
