// Typed client for the Unified AI Studio core, served from /api/studio.
// Surfaces call these instead of re-implementing logic — the ONE CORE is the
// single source of truth.

async function api<T = unknown>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api/studio${path}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  return (await res.json()) as T;
}

export const studioClient = {
  status: () => api<Record<string, number>>('GET', '/api/status'),
  chat: (text: string) => api<{ completed: string[]; failed: string[] }>('POST', '/api/chat', { text }),
  library: () => api<Array<{ id: string; title: string; text: string }>>('GET', '/api/library'),
  saveLibrary: (title: string, text: string) => api('POST', '/api/library', { title, text }),
  models: () => api<unknown[]>('GET', '/api/models'),
  workflowTemplates: () => api<Array<{ id: string; name: string }>>('GET', '/api/workflows/templates'),
  runWorkflow: (template: string) => api<{ name: string; nodes: unknown[] }>('POST', '/api/workflows/run', { template }),
  schedules: () => api<unknown[]>('GET', '/api/schedules'),
  addSchedule: (name: string, request: string, expr: string) => api('POST', '/api/schedules', { name, request, expr }),
  security: () => api<Record<string, unknown>>('GET', '/api/security'),
  register: (email: string, password: string) => api('POST', '/api/auth/register', { email, password }),
  login: (email: string, password: string) => api<{ token: string }>('POST', '/api/auth/login', { email, password }),
  me: (token: string) => api<{ id: string; email: string; role: string } | null>('GET', '/api/auth/me', undefined),
};
