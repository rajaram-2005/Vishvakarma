// Typed client for the Unified AI Studio core, served from /api/studio.
// Surfaces call these instead of re-implementing logic — the ONE CORE is the
// single source of truth. Tokens are persisted in localStorage so the proxy auth
// gate works end-to-end in the browser.

let token = '';
if (typeof localStorage !== 'undefined') token = localStorage.getItem('studio_token') ?? '';

function setToken(t: string) {
  token = t;
  if (typeof localStorage !== 'undefined') localStorage.setItem('studio_token', t);
}
function clearToken() {
  token = '';
  if (typeof localStorage !== 'undefined') localStorage.removeItem('studio_token');
}

async function api<T = unknown>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (body) headers['content-type'] = 'application/json';
  if (token) headers['authorization'] = `Bearer ${token}`;
  const res = await fetch(`/api/studio${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return (await res.json()) as T;
}

export const studioClient = {
  setToken,
  clearToken,
  getToken: () => token,
  status: () => api<Record<string, number>>('GET', '/api/status'),
  chat: (text: string) => api<{ completed: string[]; failed: string[] }>('POST', '/api/chat', { text }),
  library: () => api<Array<{ id: string; title: string; text: string }>>('GET', '/api/library'),
  saveLibrary: (title: string, text: string) => api('POST', '/api/library', { title, text }),
  models: () => api<Array<{ id: string; name?: string; provider?: string; capabilities?: string[] }>>('GET', '/api/models'),
  workflowTemplates: () => api<Array<{ id: string; name: string }>>('GET', '/api/workflows/templates'),
  runWorkflow: (template: string) => api<{ name: string; nodes: unknown[] }>('POST', '/api/workflows/run', { template }),
  runCustomWorkflow: (nodes: Array<{ id: string; name: string; dependsOn?: string[] }>) =>
    api<{ name: string; nodes: Array<{ id: string; name: string; status: string }> }>('POST', '/api/workflows/run', { nodes }),
  schedules: () => api<unknown[]>('GET', '/api/schedules'),
  addSchedule: (name: string, request: string, expr: string) => api('POST', '/api/schedules', { name, request, expr }),
  tickSchedules: () => api<{ ran: number }>('POST', '/api/schedules/tick'),
  code: (task: string) => api<{ completed: string[]; failed: string[] }>('POST', '/api/code', { task }),
  studio: (prompt: string) => api<{ completed: string[]; failed: string[] }>('POST', '/api/studio', { prompt }),
  security: () => api<Record<string, unknown>>('GET', '/api/security'),
  marketplace: () => api<Record<string, unknown>>('GET', '/api/marketplace'),
  register: (email: string, password: string) => api<{ id: string; email: string; role: string }>('POST', '/api/auth/register', { email, password }),
  login: async (email: string, password: string) => {
    const r = await api<{ token: string }>('POST', '/api/auth/login', { email, password });
    if (r.token) setToken(r.token);
    return r;
  },
  me: () => api<{ id: string; email: string; role: string } | null>('GET', '/api/auth/me', undefined),
};
