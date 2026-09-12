// Mounts the Unified AI Studio ONE CORE inside the Next.js app. This single
// catch-all route delegates to the same createWebApp handler used by the
// standalone server, so all surfaces (chat, library, models, workflows,
// schedules, security, packages, i18n, chaos, auth) are available here too.
//
// For production you would back this with real DB storage + live adapters; here
// we reuse the in-memory store so the route is self-contained and demonstrable.

import { NextRequest, NextResponse } from 'next/server';
import { Platform, MemoryStorage, AuthService, registryFromEnv, adapterExecutor, createWebApp } from '@sutra/orchestration';

const platform = new Platform({ seedSample: true });
const auth = new AuthService(new MemoryStorage());
const adapters = registryFromEnv();
const defaultModel = adapters.listModels()[0]?.id ?? 'openai';
const app = createWebApp({
  platform,
  storage: new MemoryStorage(),
  auth,
  adapters,
  ...(adapters.listModels().length ? { executor: adapterExecutor(adapters, defaultModel) } : {}),
});

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug?: string[] }> }) {
  const { slug } = await params;
  const path = '/' + (slug ?? []).join('/') + (req.nextUrl.search ?? '');
  const out = await app({ method: 'GET', path, query: req.nextUrl.searchParams, body: undefined, auth: req.headers.get('authorization') ?? undefined });
  return new NextResponse(out.html ?? JSON.stringify(out.json ?? ''), { status: out.status, headers: out.headers });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug?: string[] }> }) {
  const { slug } = await params;
  const path = '/' + (slug ?? []).join('/') + (req.nextUrl.search ?? '');
  let body: unknown = undefined;
  const ct = req.headers.get('content-type') ?? '';
  if (ct.includes('application/json')) {
    try {
      body = await req.json();
    } catch {
      body = undefined;
    }
  }
  const out = await app({ method: 'POST', path, query: req.nextUrl.searchParams, body, auth: req.headers.get('authorization') ?? undefined });
  return new NextResponse(out.html ?? JSON.stringify(out.json ?? ''), { status: out.status, headers: out.headers });
}
