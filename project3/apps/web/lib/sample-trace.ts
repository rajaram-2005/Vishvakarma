// Lumen — a representative trace for the landing demo:
// Request → Router → Model → Agent → Tool → Workflow → Database → Response.

import type { Trace } from '@sutra/shared';

const t0 = 1_750_000_000_000;

export const DEFAULT_SAMPLE_TRACE: Trace = {
  id: 'tr-sample-01',
  name: 'chat.request',
  start: t0,
  end: t0 + 412,
  status: 'ok',
  spans: [
    { id: 'sp-1', traceId: 'tr-sample-01', name: 'request.receive', kind: 'server', start: t0 + 0, end: t0 + 8, status: 'ok', attrs: { chars: '64' } },
    { id: 'sp-2', traceId: 'tr-sample-01', name: 'router.decide', kind: 'internal', start: t0 + 8, end: t0 + 21, status: 'ok', attrs: { intents: 'code · structured', chosen: 'llama3.1-8b' } },
    { id: 'sp-3', traceId: 'tr-sample-01', name: 'model.ollama', kind: 'client', start: t0 + 21, end: t0 + 236, status: 'ok', attrs: { model: 'llama3.1-8b', tokens: '312' } },
    { id: 'sp-4', traceId: 'tr-sample-01', name: 'agent.loop', kind: 'internal', start: t0 + 236, end: t0 + 290, status: 'ok', attrs: { steps: 'plan · execute · verify' } },
    { id: 'sp-5', traceId: 'tr-sample-01', name: 'tool.fs.write', kind: 'internal', start: t0 + 290, end: t0 + 304, status: 'ok', attrs: { path: 'src/utils.ts', risk: 'low' } },
    { id: 'sp-6', traceId: 'tr-sample-01', name: 'workflow.notify', kind: 'internal', start: t0 + 304, end: t0 + 318, status: 'ok', attrs: { event: 'activity' } },
    { id: 'sp-7', traceId: 'tr-sample-01', name: 'db.memory.write', kind: 'client', start: t0 + 318, end: t0 + 341, status: 'ok', attrs: { kind: 'fact' } },
    { id: 'sp-8', traceId: 'tr-sample-01', name: 'response.send', kind: 'server', start: t0 + 341, end: t0 + 412, status: 'ok', attrs: { chars: '1840' } },
  ],
};
