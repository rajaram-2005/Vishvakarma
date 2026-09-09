// SUTRA — service API client (services/api, FastAPI).
// Optional layer: when a base URL is configured AND privacy mode is not
// local, chat/routing/security/workflow/RAG can route through the service
// layer. In local mode the workspace is fully offline — the client refuses
// to use the server (the contract), and every failure falls back to the
// local core with an honest trace span.
import type { RiskLevel, Settings, ToolCategory, Workflow } from '@sutra/shared';

export class ServerError extends Error {
  kind: 'unreachable' | 'http' | 'parse';
  constructor(message: string, kind: ServerError['kind'] = 'unreachable') {
    super(message);
    this.kind = kind;
  }
}

/** trim, validate http(s), strip trailing slashes; '' when unusable */
export function normalizeBaseUrl(u: string | undefined | null): string {
  if (!u) return '';
  const t = u.trim();
  if (!/^https?:\/\//i.test(t)) return '';
  return t.replace(/\/+$/, '');
}

export function serverUrl(s: Settings): string | null {
  return normalizeBaseUrl(s.server?.baseUrl) || null;
}

/** Configured AND allowed by the privacy contract (local mode = offline). */
export function serverUsable(s: Settings): boolean {
  return serverUrl(s) !== null && s.privacyMode !== 'local';
}

export function serverStatus(s: Settings): { state: 'off' | 'blocked' | 'on'; detail: string } {
  const u = serverUrl(s);
  if (!u) return { state: 'off', detail: 'not configured — everything runs on the local core' };
  if (s.privacyMode === 'local')
    return { state: 'blocked', detail: 'local mode is fully offline — switch to hybrid to route through the API (enforced, not suggested)' };
  return { state: 'on', detail: `active · ${u}` };
}

// ---------------------------------------------------------------------------
// transport
// ---------------------------------------------------------------------------

async function json<T>(url: string, init?: RequestInit, timeoutMs = 8000): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(url, { headers: { 'content-type': 'application/json' }, signal: ctrl.signal, ...init });
  } catch (e) {
    throw new ServerError(
      e instanceof DOMException && e.name === 'AbortError' ? `timeout after ${timeoutMs}ms` : `unreachable (${String(e).slice(0, 80)})`,
    );
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const b = (await res.json()) as any;
      if (b?.detail) detail += ` · ${typeof b.detail === 'string' ? b.detail : JSON.stringify(b.detail)}`;
    } catch {
      /* body not json */
    }
    throw new ServerError(detail, 'http');
  }
  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// SSE chat (server frame format — see services/api/app/main.py)
// ---------------------------------------------------------------------------

export interface SseState {
  content: string;
  model: string;
  runtime: string;
  reasons: string[];
  done: boolean;
  error: string | null;
}

export function emptySse(): SseState {
  return { content: '', model: '', runtime: '', reasons: [], done: false, error: null };
}

/** Pure: apply one SSE line (`data: {...}`) to the accumulator. */
export function applySseLine(st: SseState, line: string): SseState {
  const t = line.trim();
  if (!t.startsWith('data:')) return st;
  const payload = t.slice(5).trim();
  if (!payload) return st;
  let d: any;
  try {
    d = JSON.parse(payload);
  } catch {
    return st;
  }
  if (typeof d.text === 'string') {
    return { ...st, content: st.content + d.text };
  }
  if (typeof d.error === 'string') {
    return { ...st, error: d.error };
  }
  if (d.done === true) {
    return { ...st, done: true, model: d.model ?? st.model };
  }
  // route frame: {model, runtime, reasons}
  if (typeof d.model === 'string') {
    return { ...st, model: d.model, runtime: d.runtime ?? st.runtime, reasons: Array.isArray(d.reasons) ? d.reasons : st.reasons };
  }
  return st;
}

/** Split an SSE buffer into complete frames (frames end with a blank line). */
export function splitSseFrames(buf: string): { frames: string[]; rest: string } {
  const frames: string[] = [];
  let rest = buf;
  let i: number;
  while ((i = rest.indexOf('\n\n')) >= 0) {
    frames.push(rest.slice(0, i));
    rest = rest.slice(i + 2);
  }
  return { frames, rest };
}

export interface ServerChatOpts {
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  modelId?: string;
  requireLocal?: boolean;
  maxTokens?: number;
  temperature?: number;
}

/** Streams the full answer; returns route info + content. Throws ServerError. */
export async function serverChat(baseUrl: string, opts: ServerChatOpts, timeoutMs = 90000): Promise<SseState> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(`${baseUrl}/api/v1/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(opts),
      signal: ctrl.signal,
    });
  } catch (e) {
    throw new ServerError(e instanceof DOMException && e.name === 'AbortError' ? `timeout after ${timeoutMs}ms` : `unreachable (${String(e).slice(0, 80)})`);
  }
  if (!res.ok || !res.body) {
    clearTimeout(timer);
    let detail = `HTTP ${res.status}`;
    try {
      const b = (await res.json()) as any;
      if (b?.detail) detail += ` · ${typeof b.detail === 'string' ? b.detail : JSON.stringify(b.detail)}`;
    } catch {
      /* noop */
    }
    throw new ServerError(detail, 'http');
  }
  try {
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    const st = emptySse();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const { frames, rest } = splitSseFrames(buf);
      buf = rest;
      for (const frame of frames) {
        for (const line of frame.split('\n')) {
          const ns = applySseLine(st, line);
          if (ns !== st) Object.assign(st, ns);
        }
      }
      if (st.done || st.error) break;
    }
    return st;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// typed endpoints
// ---------------------------------------------------------------------------

export interface ServerHealth {
  service: string;
  version: string;
  privacyMode: string;
  syncScope: string;
  backends: string[];
  documents: number;
  tasks: number;
}

export interface ServerModel {
  id: string;
  name: string;
  runtime: string;
  contextWindow: number;
  costIn: number;
  latencyTier: string;
  capabilities: string[];
  available: boolean;
  local: boolean;
}

export interface ServerRoute {
  analysis: { intents: string[]; needsLocal: boolean; charCount: number; label: string };
  ranking: Array<{ modelId: string; score: number; reasons: string[] }>;
  chosen: ServerModel | null;
}

export interface AssessOut {
  risk: RiskLevel;
  requiresApproval: boolean;
  reasons: string[];
  category: ToolCategory;
}

export interface ScanOut {
  findings: Array<{ file: string; line: number; kind: string }>;
  clean: boolean;
  note?: string;
}

/** Web Workflow → SUTRA service JSON (same fields, no client-only extras). */
export function mapWorkflow(wf: Workflow) {
  return {
    id: wf.id,
    name: wf.name,
    description: wf.description,
    trigger: wf.trigger,
    nodes: wf.nodes.map((n) => ({ id: n.id, type: n.type, label: n.label, config: n.config })),
    edges: wf.edges,
  };
}

const post = <T>(b: string, path: string, body: unknown, timeoutMs?: number) =>
  json<T>(`${b}${path}`, { method: 'POST', body: JSON.stringify(body) }, timeoutMs);

export const server = {
  health: (b: string) => json<ServerHealth>(`${b}/health`),
  models: (b: string) => json<{ models: ServerModel[] }>(`${b}/api/v1/models`),
  route: (b: string, text: string, requireLocal = false) => post(b, '/api/v1/route', { text, requireLocal }),
  chat: (b: string, opts: ServerChatOpts) => serverChat(b, opts),
  assess: (b: string, category: string, detail = '') => post<AssessOut>(b, '/api/v1/security/assess', { category, detail }),
  scan: (b: string, text: string) => post<ScanOut>(b, '/api/v1/security/scan', { text }),
  validateWorkflow: (b: string, wf: Workflow) => post<{ errors: string[]; valid: boolean }>(b, '/api/v1/workflows/validate', { workflow: mapWorkflow(wf) }),
  topo: (b: string, wf: Workflow) => post<{ order: string[] }>(b, '/api/v1/workflows/topo', { workflow: mapWorkflow(wf) }),
  toN8n: (b: string, wf: Workflow) => post<Record<string, unknown>>(b, '/api/v1/workflows/n8n', { workflow: mapWorkflow(wf) }),
  ragIngest: (b: string, d: { title: string; text: string; source?: string }) => post(b, '/api/v1/rag/ingest', d),
  ragQuery: (b: string, query: string, k = 5) => post(b, '/api/v1/rag/query', { query, k }),
  tasksList: (b: string, status?: string) => json<{ tasks: unknown[] }>(`${b}/api/v1/tasks${status ? `?status=${status}` : ''}`),
  taskCreate: (b: string, t: { title: string; description?: string; priority?: string; tags?: string[] }) => post(b, '/api/v1/tasks', t),
  deployLocal: (b: string, d: { name: string; files: Record<string, string> }) => post(b, '/api/v1/deploy/local', d, 30000),
  traces: (b: string) => json<{ document: unknown; spans: number }>(`${b}/api/v1/traces`),
  audit: (b: string) => json<{ events: Array<Record<string, unknown>> }>(`${b}/api/v1/audit`),
};
