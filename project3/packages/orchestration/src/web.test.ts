import { describe, it, expect } from 'vitest';
import { Platform } from './platform';
import { MemoryStorage } from './storage';
import { createWebApp, requiredPermission, type WebRequest } from './web';

function app() {
  const platform = new Platform({ seedSample: true });
  const storage = new MemoryStorage();
  return createWebApp({ platform, storage });
}

function req(r: Partial<WebRequest>): WebRequest {
  return { method: 'GET', path: '/', query: new URLSearchParams(), body: undefined, ...r };
}

describe('Web application (§120/§121)', () => {
  it('renders the home page as HTML', async () => {
    const res = await app()(req({ method: 'GET', path: '/' }));
    expect(res.status).toBe(200);
    expect(res.html).toContain('Unified AI Studio');
    expect(res.headers?.['content-type']).toContain('text/html');
  });

  it('serves every surface page', async () => {
    const a = app();
    for (const p of ['/chat', '/library', '/models', '/workflows', '/schedules', '/security', '/packages', '/settings']) {
      const res = await a(req({ method: 'GET', path: p }));
      expect(res.status).toBe(200);
      expect(res.html).toBeTruthy();
    }
  });

  it('chat API runs the request through the core', async () => {
    const res = await app()(req({ method: 'POST', path: '/api/chat', body: { text: 'Research something' } }));
    expect(res.status).toBe(200);
    expect(Array.isArray((res.json as { completed: string[] }).completed)).toBe(true);
  });

  it('library API persists assets', async () => {
    const a = app();
    expect((await a(req({ method: 'GET', path: '/api/library' }))).json).toEqual([]);
    const save = await a(req({ method: 'POST', path: '/api/library', body: { title: 'Notes', text: 'data' } }));
    expect(save.status).toBe(201);
    const list = (await a(req({ method: 'GET', path: '/api/library' }))).json as unknown[];
    expect(list.length).toBe(1);
  });

  it('models, workflow templates and runs work', async () => {
    const a = app();
    expect((await a(req({ method: 'GET', path: '/api/models' }))).json).toBeInstanceOf(Array);
    const tmpl = (await a(req({ method: 'GET', path: '/api/workflows/templates' }))).json as unknown[];
    expect(tmpl.length).toBeGreaterThan(0);
    const run = await a(req({ method: 'POST', path: '/api/workflows/run', body: { template: 'research-report' } }));
    expect(run.status).toBe(200);
    expect((run.json as { nodes: unknown[] }).nodes.length).toBeGreaterThan(0);
  });

  it('runs a custom workflow from the visual builder', async () => {
    const a = app();
    const run = await a(
      req({
        method: 'POST',
        path: '/api/workflows/run',
        body: { name: 'My Flow', nodes: [ { id: 'a', name: 'Step A', dependsOn: [] }, { id: 'b', name: 'Step B', dependsOn: ['a'] } ] },
      }),
    );
    expect(run.status).toBe(200);
    expect((run.json as { nodes: unknown[] }).nodes.length).toBe(2);
  });

  it('ticks due schedules through the core', async () => {
    const a = app();
    await a(req({ method: 'POST', path: '/api/schedules', body: { name: 't', request: 'Research solar EV charging', expr: 'daily' } }));
    const tick = await a(req({ method: 'POST', path: '/api/schedules/tick' }));
    expect(tick.status).toBe(200);
    expect(typeof (tick.json as { ran: number }).ran).toBe('number');
  });

  it('schedules and plugins can be created via API', async () => {
    const a = app();
    const sch = await a(req({ method: 'POST', path: '/api/schedules', body: { name: 't', request: 'do x', expr: 'daily' } }));
    expect(sch.status).toBe(201);
    expect((await a(req({ method: 'GET', path: '/api/schedules' }))).json as unknown[]).toHaveLength(1);
    const pl = await a(req({ method: 'POST', path: '/api/plugins', body: { id: 'p', name: 'P' } }));
    expect(pl.status).toBe(201);
  });

  it('security and i18n endpoints respond', async () => {
    const a = app();
    expect((await a(req({ method: 'GET', path: '/api/security' }))).json).toHaveProperty('openAlerts');
    const i18n = (await a(req({ method: 'GET', path: '/api/i18n', query: new URLSearchParams('locale=ta&key=action.run') }))).json as { value: string };
    expect(i18n.value).toBe('இயக்கு');
  });

  it('chaos endpoint reports graceful recovery', async () => {
    const res = await app()(req({ method: 'POST', path: '/api/chaos', body: { scenario: 'model-down' } }));
    expect(res.status).toBe(200);
    expect((res.json as { graceful: boolean }).graceful).toBe(true);
  });

  it('unknown api returns 404', async () => {
    const res = await app()(req({ method: 'GET', path: '/api/nope' }));
    expect(res.status).toBe(404);
  });

  it('marketplace endpoint returns trust summary', async () => {
    const res = await app()(req({ method: 'GET', path: '/api/marketplace' }));
    expect(res.status).toBe(200);
    expect((res.json as { listings: number }).listings).toBe(0);
  });
});

describe('RBAC permission mapping (§32/§69)', () => {
  it('open by default for GET and auth endpoints', () => {
    expect(requiredPermission('GET', '/api/models')).toBeNull();
    expect(requiredPermission('POST', '/api/auth/login')).toBeNull();
  });
  it('maps mutating endpoints to capabilities', () => {
    expect(requiredPermission('POST', '/api/chat')).toBe('read');
    expect(requiredPermission('POST', '/api/library')).toBe('create');
    expect(requiredPermission('POST', '/api/workflows/run')).toBe('create');
    expect(requiredPermission('POST', '/api/schedules/tick')).toBe('deploy');
    expect(requiredPermission('POST', '/api/plugins')).toBe('manage-users');
    expect(requiredPermission('POST', '/api/marketplace')).toBe('edit');
    expect(requiredPermission('POST', '/api/code')).toBe('create');
  });
});
