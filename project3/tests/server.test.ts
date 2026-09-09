import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ServerError,
  applySseLine,
  emptySse,
  mapWorkflow,
  normalizeBaseUrl,
  server,
  serverStatus,
  serverUsable,
  serverUrl,
  splitSseFrames,
} from '../apps/web/lib/server';
import { SETTINGS } from './helpers';
import type { Settings, Workflow } from '@sutra/shared';

const withServer = (u: string, mode: Settings['privacyMode'] = 'hybrid'): Settings => ({
  ...SETTINGS,
  privacyMode: mode,
  server: { baseUrl: u },
});

describe('server url handling', () => {
  it('normalizes: trims, strips slashes, rejects non-http', () => {
    expect(normalizeBaseUrl('  http://localhost:8000/  ')).toBe('http://localhost:8000');
    expect(normalizeBaseUrl('https://api.sutra.dev///')).toBe('https://api.sutra.dev');
    expect(normalizeBaseUrl('')).toBe('');
    expect(normalizeBaseUrl(undefined)).toBe('');
    expect(normalizeBaseUrl('localhost:8000')).toBe('');
    expect(normalizeBaseUrl('ftp://nope')).toBe('');
  });

  it('serverUrl returns null for empty config', () => {
    expect(serverUrl(SETTINGS)).toBeNull();
    expect(serverUrl(withServer('http://localhost:8000'))).toBe('http://localhost:8000');
  });

  it('local mode NEVER uses the server — the offline contract', () => {
    expect(serverUsable(SETTINGS)).toBe(false);
    expect(serverUsable(withServer('http://localhost:8000', 'local'))).toBe(false);
    expect(serverUsable(withServer('http://localhost:8000', 'hybrid'))).toBe(true);
    expect(serverUsable(withServer('http://localhost:8000', 'cloud'))).toBe(true);
  });

  it('serverStatus explains off / blocked / on', () => {
    expect(serverStatus(SETTINGS).state).toBe('off');
    expect(serverStatus(withServer('http://localhost:8000', 'local')).state).toBe('blocked');
    expect(serverStatus(withServer('http://localhost:8000', 'hybrid')).state).toBe('on');
  });
});

describe('SSE parsing (server frame format)', () => {
  it('accumulates route + text + done frames', () => {
    let st = emptySse();
    st = applySseLine(st, 'event: route');
    st = applySseLine(
      st,
      'data: {"model": "llama3.1-8b", "runtime": "ollama", "reasons": ["matches code", "fast tier"]}',
    );
    expect(st.model).toBe('llama3.1-8b');
    expect(st.runtime).toBe('ollama');
    expect(st.reasons).toHaveLength(2);
    expect(st.content).toBe('');

    st = applySseLine(st, 'data: {"text": "Hel"}');
    st = applySseLine(st, 'data: {"text": "lo"}');
    expect(st.content).toBe('Hello');

    st = applySseLine(st, 'data: {"done": true, "model": "llama3.1-8b", "chars": 4}');
    expect(st.done).toBe(true);
    expect(st.error).toBeNull();
  });

  it('surfaces stream errors and ignores junk lines', () => {
    let st = emptySse();
    st = applySseLine(st, 'data: not-json');
    st = applySseLine(st, '');
    st = applySseLine(st, 'data: {"error": "All connection attempts failed"}');
    expect(st.error).toBe('All connection attempts failed');
    expect(st.content).toBe('');
  });

  it('splitSseFrames handles partial buffers', () => {
    const { frames, rest } = splitSseFrames('data: {"a":1}\n\ndata: {"b":2\n');
    expect(frames).toHaveLength(1);
    expect(frames[0]).toBe('data: {"a":1}');
    expect(rest).toBe('data: {"b":2\n');
  });
});

describe('workflow mapping', () => {
  it('maps web workflows to the service contract', () => {
    const wf: Workflow = {
      id: 'wf-x',
      name: 'X',
      description: 'd',
      trigger: 'manual',
      nodes: [
        { id: 'a', type: 'trigger', label: 'Start', config: {} },
        { id: 'b', type: 'ai', label: 'Think', config: { prompt: 'p' } },
      ],
      edges: [['a', 'b']],
      updatedAt: new Date().toISOString(),
    };
    const m = mapWorkflow(wf);
    expect(m.id).toBe('wf-x');
    expect(m.trigger).toBe('manual');
    expect(m.nodes[1]).toEqual({ id: 'b', type: 'ai', label: 'Think', config: { prompt: 'p' } });
    expect(m.edges).toEqual([['a', 'b']]);
    expect(m).not.toHaveProperty('updatedAt');
  });
});

describe('transport errors', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = (async () => {
      throw new TypeError('fetch failed');
    }) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('health failure surfaces as ServerError (unreachable)', async () => {
    await expect(server.health('http://localhost:9')).rejects.toBeInstanceOf(ServerError);
    await expect(server.health('http://localhost:9')).rejects.toMatchObject({ kind: 'unreachable' });
  });

  it('http 404 surfaces as ServerError with detail', async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ detail: 'unknown model' }), { status: 404 })) as unknown as typeof fetch;
    await expect(server.models('http://x')).rejects.toMatchObject({ kind: 'http' });
  });
});
