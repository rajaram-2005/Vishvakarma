// SUTRA mobile API client — talks to the service API on your LAN.
// Base URL is set in Settings (default http://192.168.1.100:8000 for Expo Go).
const DEFAULT_BASE = 'http://192.168.1.100:8000';

let base = DEFAULT_BASE;
export function setBase(url: string) {
  base = url.replace(/\/+$/, '');
}
export function getBase() {
  return base;
}

async function j<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(base + path, {
    headers: { 'content-type': 'application/json' },
    ...init,
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(typeof body === 'string' ? body : (body as any).detail ? JSON.stringify((body as any).detail) : `HTTP ${r.status}`);
  return body as T;
}

export type Model = { id: string; name: string; runtime: string; local: boolean };
export type RouteDecision = { analysis: { intents: string[]; label: string }; chosen: Model | null; ranking: { modelId: string; score: number; reasons: string[] }[] };
export type Approval = { id: string; action: string; risk: string; reasons: string[]; status: string; decision?: string };

export const api = {
  health: () => j<any>('/health'),
  models: () => j<{ models: Model[] }>('/api/v1/models'),
  route: (text: string, requireLocal = true) => j<RouteDecision>('/api/v1/route', { method: 'POST', body: JSON.stringify({ text, requireLocal }) }),
  // SSE chat: streams text chunks
  async *chat(messages: { role: string; content: string }[], modelId?: string): AsyncGenerator<string> {
    const r = await fetch(base + '/api/v1/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages, modelId }),
    });
    if (!r.ok || !r.body) throw new Error(`HTTP ${r.status}`);
    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i: number;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const frame = buf.slice(0, i);
        buf = buf.slice(i + 2);
        const line = frame.split('\n').find((l) => l.startsWith('data:'));
        if (!line) continue;
        try {
          const d = JSON.parse(line.slice(5));
          if (d.text) yield d.text as string;
          if (d.done || d.error) return;
        } catch {
          /* partial frame */
        }
      }
    }
  },
  assess: (category: string, detail = '') => j<{ risk: string; requiresApproval: boolean; reasons: string[] }>('/api/v1/security/assess', { method: 'POST', body: JSON.stringify({ category, detail }) }),
  scan: (text: string) => j<{ findings: { line: number; kind: string }[]; clean: boolean }>('/api/v1/security/scan', { method: 'POST', body: JSON.stringify({ text }) }),
  approvals: (status?: string) => j<{ approvals: Approval[] }>(status ? `/api/v1/security/approvals?status=${status}` : '/api/v1/security/approvals'),
  resolve: (id: string, decision: 'once' | 'session' | 'deny' | 'inspect') => j<Approval>(`/api/v1/security/approvals/${id}/resolve`, { method: 'POST', body: JSON.stringify({ decision }) }),
  tasks: () => j<{ tasks: any[] }>('/api/v1/tasks'),
  createTask: (t: { title: string; priority?: string; tags?: string[] }) => j<any>('/api/v1/tasks', { method: 'POST', body: JSON.stringify(t) }),
};
