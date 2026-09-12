#!/usr/bin/env tsx
// @sutra/orchestration — runnable API + dashboard for the Unified AI Studio
// ONE CORE. Serves JSON endpoints and a single-page dashboard so the
// architecture can be exercised end-to-end without a full web app.
//
//   tsx server.ts            # listens on :4789
//   curl -X POST localhost:4789/api/run -d '{"text":"..."}'

import { createServer } from 'node:http';
import { OrchestrationCore, HealthRegistry, CostEngine, CAPABILITY_MATRIX, buildSampleCore, demoExecutor, sampleContext, SAMPLE_REQUEST, runChaos, runWorkflow, WORKFLOW_TEMPLATES, Platform } from './src/index';

const PORT = Number(process.env.PORT ?? 4789);

const core = buildSampleCore();
const platform = new Platform({ seedSample: true });
const health = new HealthRegistry();
health.recordSuccess('research-model', 40);
health.recordError('writer-model');
health.recordError('writer-model');

function dashboardHtml(): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Unified AI Studio — ONE CORE</title>
<style>
  :root { color-scheme: dark; }
  body { margin:0; font-family: ui-sans-serif, system-ui, sans-serif; background:#0b0f1a; color:#e6edf3; }
  header { padding:18px 22px; border-bottom:1px solid #1c2638; display:flex; gap:12px; align-items:center; }
  header h1 { font-size:16px; margin:0; }
  main { display:grid; grid-template-columns: 1.2fr 1fr; gap:16px; padding:18px 22px; }
  .card { background:#111827; border:1px solid #1c2638; border-radius:12px; padding:14px 16px; }
  h2 { font-size:13px; text-transform:uppercase; letter-spacing:.06em; color:#8b98a9; margin:0 0 10px; }
  textarea { width:100%; height:64px; background:#0b0f1a; color:#e6edf3; border:1px solid #1c2638; border-radius:8px; padding:8px; resize:vertical; }
  button { background:#2563eb; color:white; border:0; border-radius:8px; padding:8px 14px; cursor:pointer; font-weight:600; }
  .node { display:flex; justify-content:space-between; gap:10px; padding:7px 10px; border:1px solid #1c2638; border-radius:8px; margin-bottom:6px; }
  .badge { font-size:11px; padding:2px 8px; border-radius:999px; background:#1e293b; color:#9fb3c8; }
  .ok { background:#063b2b; color:#7ee2b8; } .fail { background:#3b0d0d; color:#ff9b9b; }
  .wait { background:#3a2f06; color:#f4d58d; } .run { background:#0b2545; color:#9cc4ff; }
  .span { font-size:12px; padding:3px 0; border-bottom:1px dashed #1c2638; }
  pre { white-space:pre-wrap; font-size:12px; color:#9fb3c8; }
  .muted { color:#8b98a9; font-size:12px; }
</style></head>
<body>
<header><h1>Unified AI Studio</h1><span class="muted">ONE CORE · capability graph · task engine · execution engine</span></header>
<main>
  <div class="card">
    <h2>Request → Task Graph</h2>
    <textarea id="req">${SAMPLE_REQUEST}</textarea>
    <div style="margin-top:10px; display:flex; gap:10px; align-items:center">
      <button id="run">Run through the core</button>
      <button id="approve" style="background:#374151">Approve permissions</button>
      <span class="muted" id="status"></span>
    </div>
    <div id="graph" style="margin-top:14px"></div>
  </div>
  <div class="card">
    <h2>Live Trace</h2>
    <div id="trace"></div>
    <h2 style="margin-top:16px">Events / Approvals</h2>
    <pre id="events"></pre>
  </div>
  <div class="card">
    <h2>Capability Graph</h2>
    <pre id="caps"></pre>
  </div>
  <div class="card">
    <h2>Provider Health (§10)</h2>
    <pre id="health"></pre>
    <h2 style="margin-top:14px">Offline/Online Matrix (§60)</h2>
    <pre id="matrix"></pre>
  </div>
</main>
<script>
const status = (s) => (document.getElementById('status').textContent = s);
async function loadSide() {
  const [caps, h, m] = await Promise.all([
    fetch('/api/capabilities').then(r=>r.json()),
    fetch('/api/health').then(r=>r.json()),
    fetch('/api/matrix').then(r=>r.json()),
  ]);
  document.getElementById('caps').textContent = caps.map(c=>c.id+' ('+c.type+')').join('\\n');
  document.getElementById('health').textContent = Object.entries(h).map(([k,v])=>k+': '+v.status+' errRate '+v.errorRate.toFixed(2)).join('\\n');
  document.getElementById('matrix').textContent = m.map(r=>r.capability.padEnd(18)+' on='+r.online+' off='+r.offline).join('\\n');
}
async function run() {
  status('running…');
  const text = document.getElementById('req').value;
  const res = await fetch('/api/run', {method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({text})});
  const data = await res.json();
  const g = document.getElementById('graph'); g.innerHTML='';
  for (const n of Object.values(data.graph.nodes)) {
    const cls = n.status==='completed'?'ok':n.status==='failed'?'fail':n.status.startsWith('waiting')?'wait':'run';
    g.insertAdjacentHTML('beforeend', '<div class="node"><span>'+n.name+'</span><span class="badge '+cls+'">'+n.status+'</span></div>');
  }
  const t = document.getElementById('trace'); t.innerHTML='';
  for (const s of data.trace.spans) t.insertAdjacentHTML('beforeend', '<div class="span">'+s.name+' · '+(s.end-s.start)+'ms · '+s.status+'</div>');
  document.getElementById('events').textContent = (data.events||[]).join('\\n');
  status('completed: '+data.completed.length+' · failed: '+data.failed.length+' · cost $'+data.cost);
}
document.getElementById('run').onclick = run;
loadSide();
</script>
</body></html>`;
}

function sendJson(res: any, code: number, obj: unknown): void {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'content-type': 'application/json' });
  res.end(body);
}

function readBody(req: any): Promise<string> {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c: Buffer) => (data += c));
    req.on('end', () => resolve(data));
  });
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(dashboardHtml());
      return;
    }
    if (req.method === 'GET' && url.pathname === '/api/matrix') return sendJson(res, 200, CAPABILITY_MATRIX);
    if (req.method === 'GET' && url.pathname === '/api/capabilities') {
      return sendJson(res, 200, core.registry.all().map((c) => ({ id: c.id, type: c.type, permissions: c.permissions, network: c.network })));
    }
    if (req.method === 'GET' && url.pathname === '/api/health') return sendJson(res, 200, health.summary());
    if (req.method === 'POST' && url.pathname === '/api/plan') {
      const body = JSON.parse(await readBody(req));
      const { graph } = core.plan(body.text || SAMPLE_REQUEST);
      const reports = core.validatePlan(graph, sampleContext);
      return sendJson(res, 200, { graph, reports: [...reports.entries()].map(([k, v]) => ({ id: k, compatible: v.compatible })) });
    }
    if (req.method === 'POST' && url.pathname === '/api/run') {
      const body = JSON.parse(await readBody(req));
      const { graph } = core.plan(body.text || SAMPLE_REQUEST);
      const events: string[] = [];
      core.bus.onAny((name) => events.push(name as string));
      const cost = new CostEngine();
      const result = await core.run(graph, demoExecutor(), {
        context: sampleContext,
        pauseForPermission: true,
        onPermissionRequired: async () => 'approve-once',
        costEngine: cost,
        costScope: 'user:web',
      });
      return sendJson(res, 200, {
        graph,
        completed: result.completed,
        failed: result.failed,
        paused: result.paused,
        trace: { id: result.trace.id, status: result.trace.status, spans: result.trace.spans.map((s) => ({ name: s.name, start: s.start, end: s.end, status: s.status })) },
        approvals: core.approvalCenter.list('approved').map((a) => ({ task: a.task, action: a.requestedAction, risk: a.risk })),
        cost: Number(cost.total().toFixed(4)),
        events,
      });
    }
    if (req.method === 'POST' && url.pathname === '/api/chaos') {
      const body = JSON.parse(await readBody(req));
      const out = await runChaos(core, body.text || SAMPLE_REQUEST, body.scenario || 'model-down', sampleContext);
      return sendJson(res, 200, out);
    }
    if (req.method === 'POST' && url.pathname === '/api/workflow') {
      const body = JSON.parse(await readBody(req));
      const wf = (WORKFLOW_TEMPLATES.find((t) => t.id === body.template) ?? WORKFLOW_TEMPLATES[0]).build();
      const { debug } = await runWorkflow(core, wf, demoExecutor(), { context: sampleContext });
      return sendJson(res, 200, { name: wf.name, nodes: debug });
    }
    if (req.method === 'GET' && url.pathname === '/api/platform/status') {
      return sendJson(res, 200, platform.status());
    }
    if (req.method === 'POST' && url.pathname === '/api/platform/chat') {
      const body = JSON.parse(await readBody(req));
      const result = await platform.chat(body.text || SAMPLE_REQUEST);
      return sendJson(res, 200, { completed: result.completed, failed: result.failed, paused: result.paused });
    }
    sendJson(res, 404, { error: 'not found' });
  } catch (e) {
    sendJson(res, 500, { error: String(e instanceof Error ? e.message : e) });
  }
});

server.listen(PORT, () => {
  process.stdout.write(`Unified AI Studio ONE CORE listening on http://localhost:${PORT}\n`);
});
