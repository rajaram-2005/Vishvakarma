// Mounts the Unified AI Studio ONE CORE inside the Next.js app. This catch-all
// route delegates to the same createWebApp handler used by the standalone server,
// now backed by a REAL on-disk database (SQLite via node:sqlite) and enforcing
// authentication at the proxy for all mutating requests.
//
// For production you would run Next with NODE_OPTIONS=--experimental-sqlite and set
// STUDIO_DB to a file; STUDIO_AUTH_OPEN=1 disables the proxy auth gate for local dev.

import { NextRequest, NextResponse } from 'next/server';
import {
  Platform,
  AuthService,
  registryFromEnv,
  adapterExecutor,
  createWebApp,
  createStorageFromUrl,
  requiredPermission,
  type Storage,
} from '@sutra/orchestration';

// This route touches node built-ins (node:sqlite/pg) and long-lived singletons,
// so it must run on the Node.js runtime, not the Edge runtime.
export const runtime = 'nodejs';

interface AppBundle {
  handle: (req: { method: string; path: string; query: URLSearchParams; body: unknown; auth?: string }) => Promise<{ status: number; json?: unknown; html?: string; headers?: Record<string, string> }>;
  auth: AuthService;
}

let bundlePromise: Promise<AppBundle> | null = null;

async function getBundle(): Promise<AppBundle> {
  if (!bundlePromise) {
    bundlePromise = (async () => {
      const storage: Storage = await createStorageFromUrl(process.env.STUDIO_DB ?? ':memory:');
      const auth = new AuthService(storage);
      const adapters = registryFromEnv();
      const defaultModel = adapters.listModels()[0]?.id ?? 'openai';
      const platform = new Platform({
        seedSample: true,
        storage,
        executor: adapters.listModels().length ? adapterExecutor(adapters, defaultModel) : undefined,
      });
      const handle = createWebApp({ platform, storage, auth, adapters });
      return { handle, auth };
    })();
  }
  return bundlePromise;
}

function bearer(token?: string | null): string | undefined {
  return token ? token.replace(/^Bearer\s+/, '') : undefined;
}

/** Map the public /api/studio/* URL to the core's /api/* path the handler expects. */
function normalizePath(p: string): string {
  let path = p.replace(/^\/api\/studio/, '/api');
  if (path === '/api' || path === '/api/') path = '/';
  return path;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug?: string[] }> }) {
  await params;
  const path = normalizePath(req.nextUrl.pathname);
  const { handle } = await getBundle();
  const out = await handle({ method: 'GET', path, query: req.nextUrl.searchParams, body: undefined, auth: req.headers.get('authorization') ?? undefined });
  return new NextResponse(out.html ?? JSON.stringify(out.json ?? ''), { status: out.status, headers: out.headers });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug?: string[] }> }) {
  await params;
  const path = normalizePath(req.nextUrl.pathname);
  const { handle, auth } = await getBundle();

  // Enforce auth + RBAC at the proxy for mutating requests (auth endpoints stay open).
  const open = process.env.STUDIO_AUTH_OPEN === '1';
  const isAuthEndpoint = path.startsWith('/api/auth/');
  if (!open && !isAuthEndpoint) {
    const token = bearer(req.headers.get('authorization'));
    const user = token ? auth.verifyToken(token) : null;
    if (!user) {
      return new NextResponse(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { 'content-type': 'application/json' } });
    }
    const perm = requiredPermission(req.method ?? 'POST', path);
    if (perm && !auth.can(user.role, perm)) {
      return new NextResponse(JSON.stringify({ error: 'forbidden', required: perm }), { status: 403, headers: { 'content-type': 'application/json' } });
    }
  }

  let body: unknown = undefined;
  const ct = req.headers.get('content-type') ?? '';
  if (ct.includes('application/json')) {
    try {
      body = await req.json();
    } catch {
      body = undefined;
    }
  }
  const out = await handle({ method: 'POST', path, query: req.nextUrl.searchParams, body, auth: req.headers.get('authorization') ?? undefined });
  return new NextResponse(out.html ?? JSON.stringify(out.json ?? ''), { status: out.status, headers: out.headers });
}
