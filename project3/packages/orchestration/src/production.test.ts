import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  AuthService,
  OpenAIChatAdapter,
  OllamaAdapter,
  AnthropicAdapter,
  AdapterRegistry,
  adapterExecutor,
  contractTestModel,
  MockModelAdapter,
  createSqliteStorage,
  createStorageFromUrl,
  registryFromEnv,
  createWebApp,
  MemoryStorage,
  Platform,
  type ModelAdapter,
} from './index';
import { studioCreateStorageStore } from './storage-backend';

describe('Authentication (§69/§32)', () => {
  it('registers, logs in and verifies tokens; enforces roles', async () => {
    const auth = new AuthService(new MemoryStorage());
    const u = await auth.register('a@b.com', 'pw123', 'editor');
    expect(u.role).toBe('editor');
    const s = await auth.login('a@b.com', 'pw123');
    const me = auth.verifyToken(s.token);
    expect(me?.email).toBe('a@b.com');
    expect(auth.can('editor', 'edit')).toBe(true);
    expect(auth.can('viewer', 'delete')).toBe(false);
    expect(auth.can('owner', 'billing')).toBe(true);
    await expect(auth.login('a@b.com', 'wrong')).rejects.toThrow();
  });

  it('issues scoped API keys', async () => {
    const auth = new AuthService(new MemoryStorage());
    await auth.register('x@y.com', 'pw', 'admin');
    const k = await auth.createApiKey('x@y.com', ['chat']);
    expect(auth.hasScope(k, 'chat')).toBe(true);
    expect(auth.hasScope(k, 'deploy')).toBe(false);
  });
});

describe('Real adapters (§96 contracts)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', async (_url: string, _init?: unknown) => ({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: 'hi there' } }], usage: { total_tokens: 3 } }),
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('OpenAI adapter maps completions correctly', async () => {
    const a = new OpenAIChatAdapter('openai', { baseUrl: 'http://x/v1', modelId: 'm' });
    const r = await a.complete('hello');
    expect(r.text).toBe('hi there');
    expect(r.tokens).toBe(3);
  });

  it('passes the model contract', async () => {
    const a: ModelAdapter = new MockModelAdapter('o');
    expect((await contractTestModel(a)).ok).toBe(true);
  });

  it('maps 401 -> auth and 429 -> rate-limit errors', async () => {
    vi.stubGlobal('fetch', async () => ({ ok: false, status: 401, json: async () => ({}) }));
    await expect(new OpenAIChatAdapter('o', { baseUrl: 'http://x/v1', modelId: 'm' }).complete('x')).rejects.toMatchObject({ kind: 'auth' });
    vi.unstubAllGlobals();
    vi.stubGlobal('fetch', async () => ({ ok: false, status: 429, json: async () => ({}) }));
    await expect(new OpenAIChatAdapter('o', { baseUrl: 'http://x/v1', modelId: 'm' }).complete('x')).rejects.toMatchObject({ kind: 'rate-limit' });
  });

  it('registry resolves models and builds a core executor', async () => {
    const reg = new AdapterRegistry();
    reg.registerModel(new OpenAIChatAdapter('llama', { baseUrl: 'http://x/v1', modelId: 'm' }));
    const ex = adapterExecutor(reg, 'llama');
    const r = await ex.execute({ id: 'n', name: 'n', group: 'g', dependsOn: [], tools: [], permissions: [], input: { text: 'hi' }, status: 'running', retries: 0, maxRetries: 1 });
    expect(String(r.result)).toContain('hi');
  });
});

describe('DB-backed storage (SQLite/Postgres factory)', () => {
  it('persists via studioCreateStorageStore', async () => {
    const s = await studioCreateStorageStore(); // in-memory/file fallback
    s.set('c', 'k', { v: 1 });
    expect(s.get('c', 'k')).toEqual({ v: 1 });
    expect(s.list('c')).toHaveLength(1);
    expect(s.delete('c', 'k')).toBe(true);
  });

  it('sqlite factory returns a working storage', async () => {
    const s = await createSqliteStorage(':memory:');
    s.set('c', 'k', { v: 2 });
    expect(s.get('c', 'k')).toEqual({ v: 2 });
    expect(s.list('c')).toHaveLength(1);
  });

  it('Postgres write-through storage satisfies Storage and persists async', async () => {
    // Fake Postgres: an in-memory backend the injected query talks to.
    const backend = new Map<string, Map<string, string>>();
    const q = async (text: string, params: unknown[]) => {
      const [c, k] = params as string[];
      if (text.startsWith('SELECT')) {
        const row = backend.get(c)?.get(k);
        return { rows: row ? [{ value: row }] : [] };
      }
      if (text.startsWith('INSERT')) {
        if (!backend.has(c)) backend.set(c, new Map());
        backend.get(c)!.set(k, params[2] as string);
        return { rows: [] };
      }
      return { rows: [] };
    };
    const s = await createStorageFromUrl('postgres://user:pass@localhost/db', q);
    s.set('c', 'k', { v: 3 });
    expect(s.get('c', 'k')).toEqual({ v: 3 }); // served from in-memory mirror
    await new Promise((r) => setTimeout(r, 10)); // let async persist flush
    expect(backend.get('c')?.get('k')).toBe(JSON.stringify({ v: 3 })); // actually persisted
  });
});

describe('Coder / Studio surfaces (§42/§120)', () => {
  it('code and studio endpoints run through the core', async () => {
    const app = createWebApp({ platform: new Platform({ seedSample: true }), storage: new MemoryStorage() });
    const code = await app({ method: 'POST', path: '/api/code', query: new URLSearchParams(), body: { task: 'write a sort' } } as never);
    expect(code.status).toBe(200);
    expect((code.json as { completed: string[] }).completed.length).toBeGreaterThan(0);
    const studio = await app({ method: 'POST', path: '/api/studio', query: new URLSearchParams(), body: { prompt: 'make art' } } as never);
    expect(studio.status).toBe(200);
    expect((studio.json as { completed: string[] }).completed.length).toBeGreaterThan(0);
  });
});

describe('SQLite-backed storage factory', () => {
  it('returns a working storage (fallback path in test env)', async () => {
    const s = await createSqliteStorage(':memory:');
    s.set('c', 'k', { v: 1 });
    expect(s.get('c', 'k')).toEqual({ v: 1 });
    expect(s.list('c')).toHaveLength(1);
    expect(s.delete('c', 'k')).toBe(true);
  });
});

describe('Live adapter wiring (§96)', () => {
  it('registryFromEnv picks up OPENAI_API_KEY', () => {
    process.env.OPENAI_API_KEY = 'sk-test';
    const reg = registryFromEnv();
    expect(reg.listModels().some((m) => m.id === 'openai')).toBe(true);
    delete process.env.OPENAI_API_KEY;
  });
});

describe('Web auth endpoints', () => {
  it('register / login / me round-trip', async () => {
    const app = createWebApp({ platform: new Platform({ seedSample: true }), storage: new MemoryStorage() });
    const reg = await app({ method: 'POST', path: '/api/auth/register', query: new URLSearchParams(), body: { email: 'u@v.com', password: 'pw' } } as never);
    expect(reg.status).toBe(201);
    const login = await app({ method: 'POST', path: '/api/auth/login', query: new URLSearchParams(), body: { email: 'u@v.com', password: 'pw' } } as never);
    const token = (login.json as { token: string }).token;
    const me = await app({ method: 'GET', path: '/api/auth/me', query: new URLSearchParams(), body: undefined, auth: `Bearer ${token}` } as never);
    expect((me.json as { email: string }).email).toBe('u@v.com');
  });
});
