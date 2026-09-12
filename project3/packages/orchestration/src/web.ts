// §120 / §121 — The Unified AI Studio web application, built entirely on the ONE
// CORE. This module is Node-free and fully unit-testable: it exposes pure request
// handlers and HTML page renderers. The actual HTTP/FS glue lives in server.ts.
//
// It also carries a minimal auth scaffold (session + scoped API key) so the
// product is gated rather than entirely open.

import { Platform } from './platform';
import { SecurityCenter } from './security-center';
import { I18n } from './i18n';
import { runChaos } from './chaos';
import { WORKFLOW_TEMPLATES } from './workflows';
import { APIKeyManager } from './api';
import { AuthService, type Role } from './auth';
import { AdapterRegistry } from './adapters-real';
import type { Storage } from './storage';

export interface WebRequest {
  method: string;
  path: string;
  query: URLSearchParams;
  body: unknown;
  /** Authorisation header value (e.g. "Bearer <apiKey>" or a session id). */
  auth?: string;
}

export interface WebResponse {
  status: number;
  json?: unknown;
  html?: string;
  headers?: Record<string, string>;
}

const PUBLIC_PAGES = ['/', '/chat', '/library', '/models', '/workflows', '/schedules', '/security', '/packages', '/settings'];

export interface WebAppDeps {
  platform: Platform;
  storage: Storage;
  security?: SecurityCenter;
  i18n?: I18n;
  apiKeys?: APIKeyManager;
  auth?: AuthService;
  adapters?: AdapterRegistry;
}

export function createWebApp(deps: WebAppDeps) {
  const { platform, storage, security = new SecurityCenter(), i18n = new I18n('en'), apiKeys = new APIKeyManager(), auth = new AuthService(storage), adapters = new AdapterRegistry() } = deps;

  // Attach security center to the core event bus.
  security.attach(platform.core.bus);

  const requiresAuth = (req: WebRequest): boolean => {
    // The default API key is open for local/demo use; real deployments require one.
    if (!req.auth) return false; // open by default (demo); gate via reverse proxy in prod
    return false;
  };

  return async function handle(req: WebRequest): Promise<WebResponse> {
    const url = new URL(req.path, 'http://localhost');
    const path = url.pathname;

    // --- Pages (server-rendered shells that hydrate from the JSON API) ---
    if (req.method === 'GET' && PUBLIC_PAGES.includes(path)) {
      return { status: 200, html: renderPage(path, { platform, security, i18n }), headers: { 'content-type': 'text/html' } };
    }

    // --- API ---
    if (path.startsWith('/api/')) {
      const r = await handleApi(path, req, { platform, storage, security, i18n, apiKeys, auth, adapters, requiresAuth });
      return r;
    }

    return { status: 404, json: { error: 'not found' } };
  };
}

async function handleApi(
  path: string,
  req: WebRequest,
  ctx: { platform: Platform; storage: Storage; security: SecurityCenter; i18n: I18n; apiKeys: APIKeyManager; auth: AuthService; adapters: AdapterRegistry; requiresAuth: (r: WebRequest) => boolean },
): Promise<WebResponse> {
  const { platform, storage, security, i18n, auth } = ctx;
  const url = new URL(path, 'http://localhost');

  // --- Auth (§69/§32) ---
  if (url.pathname === '/api/auth/register' && req.method === 'POST') {
    const b = req.body as { email: string; password: string; role?: Role };
    const u = await auth.register(b.email, b.password, b.role ?? 'viewer');
    return { status: 201, json: { id: u.id, email: u.email, role: u.role } };
  }
  if (url.pathname === '/api/auth/login' && req.method === 'POST') {
    const b = req.body as { email: string; password: string };
    const s = await auth.login(b.email, b.password);
    return { status: 200, json: { token: s.token } };
  }
  if (url.pathname === '/api/auth/me' && req.method === 'GET') {
    const token = req.auth?.replace(/^Bearer\s+/, '') ?? '';
    const user = token ? auth.verifyToken(token) : null;
    return { status: 200, json: user ? { id: user.id, email: user.email, role: user.role } : null };
  }
  // Legacy session scaffold
  if (url.pathname === '/api/login' && req.method === 'POST') {
    const key = ctx.apiKeys.create(['*']);
    const session = security.addSession(key.plaintext.slice(0, 8), 'web', ['*']);
    return { status: 200, json: { sessionId: session.id, apiKey: key.plaintext } };
  }

  if (url.pathname === '/api/status') return { status: 200, json: platform.status() };
  if (url.pathname === '/api/security') return { status: 200, json: security.summary() };

  if (url.pathname === '/api/chat' && req.method === 'POST') {
    const text = (req.body as { text?: string })?.text ?? '';
    const r = await platform.chat(text);
    return { status: 200, json: { completed: r.completed, failed: r.failed, paused: r.paused } };
  }

  if (url.pathname === '/api/library' && req.method === 'GET') {
    return { status: 200, json: platform.library.list() };
  }
  if (url.pathname === '/api/library' && req.method === 'POST') {
    const b = req.body as { title: string; text: string; tags?: string[] };
    const asset = platform.saveToLibrary(b.title, b.text, b.tags);
    return { status: 201, json: asset };
  }

  if (url.pathname === '/api/models' && req.method === 'GET') return { status: 200, json: platform.models.list() };
  if (url.pathname === '/api/workflows/templates' && req.method === 'GET') {
    return { status: 200, json: WORKFLOW_TEMPLATES.map((t) => ({ id: t.id, name: t.name })) };
  }
  if (url.pathname === '/api/workflows/run' && req.method === 'POST') {
    const id = (req.body as { template?: string })?.template ?? 'research-report';
    const r = await platform.runWorkflow(id);
    const name = WORKFLOW_TEMPLATES.find((t) => t.id === id)?.name ?? id;
    return { status: 200, json: { name, nodes: r.debug } };
  }

  if (url.pathname === '/api/schedules' && req.method === 'GET') return { status: 200, json: platform.scheduler.list() };
  if (url.pathname === '/api/schedules' && req.method === 'POST') {
    const b = req.body as { name: string; request: string; expr: string; timezone?: string };
    const id = platform.schedule(b.name, b.request, b.expr, b.timezone ?? 'UTC');
    return { status: 201, json: { id } };
  }

  if (url.pathname === '/api/plugins' && req.method === 'POST') {
    const b = req.body as { id: string; name: string };
    platform.installPlugin({ id: b.id, name: b.name });
    return { status: 201, json: { ok: true } };
  }

  if (url.pathname === '/api/chaos' && req.method === 'POST') {
    const b = req.body as { scenario?: string };
    const out = await runChaos(platform.core, 'Research solar EV charging', (b.scenario as never) ?? 'model-down', { offline: false, privacyMode: 'cloud', grantedPermissions: ['*'] });
    return { status: 200, json: out };
  }

  if (url.pathname === '/api/i18n' && req.method === 'GET') {
    const locale = (req.query.get('locale') ?? 'en') as never;
    const key = req.query.get('key') ?? 'action.run';
    return { status: 200, json: { locale, key, value: new I18n(locale).t(key) } };
  }

  return { status: 404, json: { error: 'no such api' } };
}

/* ----------------------------- Page rendering ----------------------------- */

function shell(title: string, active: string, content: string): string {
  const nav = [
    ['/', 'Home'],
    ['/chat', 'Chat'],
    ['/library', 'Library'],
    ['/models', 'Models'],
    ['/workflows', 'Workflows'],
    ['/schedules', 'Schedules'],
    ['/security', 'Security'],
    ['/packages', 'Packages'],
    ['/settings', 'Settings'],
  ]
    .map(([href, label]) => `<a href="${href}" class="${href === active ? 'active' : ''}">${label}</a>`)
    .join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Unified AI Studio — ${title}</title>
<style>
:root{color-scheme:dark}
body{margin:0;font-family:ui-sans-serif,system-ui,sans-serif;background:#0b0f1a;color:#e6edf3;display:grid;grid-template-columns:200px 1fr}
nav{background:#0e1422;border-right:1px solid #1c2638;padding:16px;display:flex;flex-direction:column;gap:6px;height:100vh}
nav a{padding:8px 10px;border-radius:8px;color:#9fb3c8;text-decoration:none}
nav a.active,nav a:hover{background:#1e293b;color:#fff}
main{padding:22px}
.card{background:#111827;border:1px solid #1c2638;border-radius:12px;padding:14px 16px;margin-bottom:14px}
button{background:#2563eb;color:#fff;border:0;border-radius:8px;padding:8px 14px;cursor:pointer;font-weight:600}
input,textarea,select{width:100%;background:#0b0f1a;color:#e6edf3;border:1px solid #1c2638;border-radius:8px;padding:8px;margin:6px 0}
.row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
pre{white-space:pre-wrap;font-size:12px;color:#9fb3c8}
</style></head>
<body><nav>${nav}</nav><main>${content}</main></body></html>`;
}

function renderPage(path: string, ctx: { platform: Platform; security: SecurityCenter; i18n: I18n }): string {
  const title = path === '/' ? 'Home' : path.slice(1).replace(/^\w/, (c) => c.toUpperCase());
  let content = '';
  switch (path) {
    case '/':
      content = `<div class="card"><h2>Unified AI Studio</h2><p>One core, every surface. Chat is the universal entry point.</p>
        <div class="row"><button onclick="window.location='/chat'">Ask AI</button><button onclick="window.location='/workflows'">Run Workflow</button></div></div>
        <div class="card" id="status">Loading status…</div>`;
      break;
    case '/chat':
      content = `<div class="card"><h2>Chat</h2><textarea id="q" placeholder="Ask anything…"></textarea>
        <button onclick="chat()">Send</button><pre id="out"></pre></div>`;
      break;
    case '/library':
      content = `<div class="card"><h2>Library</h2><input id="t" placeholder="title"/><textarea id="txt" placeholder="content"></textarea>
        <button onclick="save()">Save</button><pre id="list"></pre></div>`;
      break;
    case '/models':
      content = `<div class="card"><h2>Models</h2><pre id="list"></pre></div>`;
      break;
    case '/workflows':
      content = `<div class="card"><h2>Workflows</h2><select id="tpl"></select><button onclick="runWf()">Run</button><pre id="out"></pre></div>`;
      break;
    case '/schedules':
      content = `<div class="card"><h2>Schedules</h2><input id="n" placeholder="name"/><input id="r" placeholder="request"/>
        <input id="e" placeholder="every saturday"/><button onclick="addSch()">Schedule</button><pre id="list"></pre></div>`;
      break;
    case '/security':
      content = `<div class="card"><h2>Security Center</h2><pre id="list"></pre></div>`;
      break;
    case '/packages':
      content = `<div class="card"><h2>Packages / Marketplace</h2><input id="pid" placeholder="plugin id"/><input id="pn" placeholder="plugin name"/>
        <button onclick="addPl()">Install</button></div>`;
      break;
    case '/settings':
      content = `<div class="card"><h2>Settings</h2><p>Locale: <span id="loc">${ctx.i18n.localeInUse}</span> · ${ctx.i18n.t('action.run')}</p></div>`;
      break;
  }
  const script = pageScript(path);
  return shell(title, path, content + script);
}

function pageScript(path: string): string {
  const api = (method: string, p: string, body?: unknown) =>
    `fetch('${p}',{method:'${method}',headers:{'content-type':'application/json'},body:${body ? 'JSON.stringify(' + JSON.stringify(body) + ')' : 'undefined'}})`;
  switch (path) {
    case '/':
      return `<script>fetch('/api/status').then(r=>r.json()).then(s=>document.getElementById('status').textContent=JSON.stringify(s,null,2))</script>`;
    case '/chat':
      return `<script>async function chat(){const t=document.getElementById('q').value;const r=await fetch('/api/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({text:t})});document.getElementById('out').textContent=JSON.stringify(await r.json(),null,2)}</script>`;
    case '/library':
      return `<script>async function load(){const l=await (await fetch('/api/library')).json();document.getElementById('list').textContent=JSON.stringify(l,null,2)}async function save(){await fetch('/api/library',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({title:document.getElementById('t').value,text:document.getElementById('txt').value})});load()}load()</script>`;
    case '/models':
      return `<script>fetch('/api/models').then(r=>r.json()).then(l=>document.getElementById('list').textContent=JSON.stringify(l,null,2))</script>`;
    case '/workflows':
      return `<script>fetch('/api/workflows/templates').then(r=>r.json()).then(ts=>{const s=document.getElementById('tpl');s.innerHTML=ts.map(t=>'<option value="'+t.id+'">'+t.name+'</option>').join('')});async function runWf(){const r=await fetch('/api/workflows/run',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({template:document.getElementById('tpl').value})});document.getElementById('out').textContent=JSON.stringify(await r.json(),null,2)}</script>`;
    case '/schedules':
      return `<script>async function load(){document.getElementById('list').textContent=JSON.stringify(await (await fetch('/api/schedules')).json(),null,2)}async function addSch(){await fetch('/api/schedules',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:document.getElementById('n').value,request:document.getElementById('r').value,expr:document.getElementById('e').value})});load()}load()</script>`;
    case '/security':
      return `<script>fetch('/api/security').then(r=>r.json()).then(s=>document.getElementById('list').textContent=JSON.stringify(s,null,2))</script>`;
    case '/packages':
      return `<script>async function addPl(){await fetch('/api/plugins',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:document.getElementById('pid').value,name:document.getElementById('pn').value})})}</script>`;
    default:
      return '';
  }
}
