'use client';
// Lumen — Workflows: DAG editor, live simulation, n8n export.

import React, { useRef, useState } from 'react';
import { Download, Play, Plus, Trash2, Workflow as WfIcon } from 'lucide-react';
import { useSutra } from '@/lib/store';
import { GlassPanel, SectionTitle, LogConsole, Modal } from '@/components/ui';
import { NODE_TYPES, toN8nJson, validateWorkflow, topoOrder, type WfNode, type WfWorkflow } from '@sutra/workflow-sdk';
import { uid, download } from '@sutra/shared';
import type { Workflow } from '@sutra/shared';
import { providerFor, reachableModels } from '@/lib/providers';

export default function WorkflowsPage() {
  const { s, mutate, act, trace, requestApproval } = useSutra();
  const sRef = useRef(s);
  sRef.current = s;
  const [selected, setSelected] = useState<string | null>(s.workflows[0]?.id ?? null);
  const [open, setOpen] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [running, setRunning] = useState(false);

  const wf: Workflow | null = s.workflows.find((w) => w.id === selected) ?? null;

  const upsert = (w: Workflow) =>
    mutate((st) => ({
      ...st,
      workflows: st.workflows.some((x) => x.id === w.id) ? st.workflows.map((x) => (x.id === w.id ? w : x)) : [w, ...st.workflows],
    }));

  const createWf = () => {
    const w: Workflow = {
      id: uid('wf'),
      name: 'New workflow',
      description: '',
      trigger: 'manual',
      nodes: [{ id: 'n1', type: 'trigger', label: 'Manual start', config: {} }],
      edges: [],
      updatedAt: new Date().toISOString(),
    };
    upsert(w);
    setSelected(w.id);
    setOpen(true);
  };

  const run = async (w: Workflow) => {
    setRunning(true);
    setLog([`▸ workflow: ${w.name} · trigger: ${w.trigger}`]);
    const tr = trace(`workflow.${w.id}`);
    const order = topoOrder(w as WfWorkflow);
    const vars: Record<string, string> = {};
    const pool = reachableModels(s.models, s.settings);
    const provider = providerFor(pool[0] ?? null, s.settings);
    for (const nid of order) {
      const node = w.nodes.find((n) => n.id === nid);
      if (!node) continue;
      const t0 = Date.now();
      setLog((l) => [...l, `▸ ${node.label} [${node.type}]`]);
      try {
        if (node.type === 'ai' && provider) {
          const prompt = (node.config.prompt ?? 'Summarize: ' + w.name).replace(/\$(\w+)/g, (_, k) => vars[k] ?? '');
          let out = '';
          await provider.chat({ messages: [{ role: 'user', content: prompt.slice(0, 300) }], maxTokens: 220 }, (c) => {
            if (!c.done) out += c.text;
          });
          vars.output = out.slice(0, 160);
          setLog((l) => [...l, `    → ${out.slice(0, 90).replace(/\n/g, ' ')}`]);
        } else if (node.type === 'http') {
          const url = node.config.url ?? 'https://example.com';
          try {
            const r = await fetch(url, { method: node.config.method === 'POST' ? 'POST' : 'GET' });
            setLog((l) => [...l, `    → HTTP ${r.status} from ${url.split('/')[2] ?? url}`]);
            vars.httpStatus = String(r.status);
          } catch (e) {
            setLog((l) => [...l, `    → blocked/failed: ${String((e as Error)?.message ?? e).slice(0, 60)} (local mode keeps egress honest)`]);
            vars.httpStatus = '0';
          }
        } else if (node.type === 'setVar') {
          vars[node.config.name ?? 'var'] = (node.config.value ?? '').replace(/\$(\w+)/g, (_, k) => vars[k] ?? '');
          setLog((l) => [...l, `    → set ${node.config.name ?? 'var'} = ${(node.config.value ?? '').slice(0, 40)}`]);
        } else if (node.type === 'condition') {
          const pass = (vars[node.config.varName ?? ''] ?? '') === (node.config.value ?? '');
          setLog((l) => [...l, `    → ${node.config.varName ?? '?'} ${pass ? '==' : '!='} "${node.config.value ?? ''}" · ${pass ? 'continue' : 'skip branch'}`]);
        } else if (node.type === 'approval') {
          const apId = requestApproval({ source: 'workflow', action: `${w.name}: ${node.label}`, detail: node.label, risk: 'medium', reasons: ['workflow human-approval node'] });
          setLog((l) => [...l, '    → paused — waiting for human approval (Security tab)']);
          const decision = await waitApproval(sRef, apId);
          setLog((l) => [...l, decision ? '    → approved, resuming' : '    → denied, halting']);
          if (!decision) break;
        } else if (node.type === 'shell') {
          setLog((l) => [...l, `    → shell node requires the terminal gateway (see IDE → Terminal): "${node.config.command ?? ''}"`]);
        } else {
          setLog((l) => [...l, `    → ${node.config.message ?? 'done'}`]);
        }
      } catch (e) {
        setLog((l) => [...l, `    ✗ ${String((e as Error)?.message ?? e)}`]);
      }
      tr.span(`wf.${node.id}`, Date.now() - t0, { type: node.type });
      await new Promise((r) => setTimeout(r, 350));
    }
    const id = tr.end();
    act('workflow', `ran ${w.name}`, `${order.length} nodes`, id);
    setRunning(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <SectionTitle
          overline="workflows"
          title="Automation with visible gears."
          sub="Compose triggers, AI steps, HTTP, shell, conditions and human approvals. Run them here or export standard n8n JSON."
        />
        <button onClick={createWf} className="btn-primary !py-2 text-xs">
          <Plus size={13} /> New workflow
        </button>
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        {s.workflows.map((w) => {
          const errs = validateWorkflow(w as WfWorkflow);
          return (
            <button
              key={w.id}
              onClick={() => {
                setSelected(w.id);
                setOpen(true);
              }}
              className="glass glass-hover p-4 text-left"
              style={{ borderColor: selected === w.id ? 'color-mix(in srgb, var(--acc) 50%, var(--line))' : 'var(--line)' }}
            >
              <div className="flex items-center gap-2">
                <WfIcon size={14} style={{ color: 'var(--acc2)' }} />
                <span className="font-medium text-sm">{w.name}</span>
                <span className="chip !text-[9px] ml-auto">{w.trigger}</span>
              </div>
              <div className="text-[11px] mt-1.5" style={{ color: 'var(--dim)' }}>{w.description || '—'}</div>
              <div className="mt-2 font-mono text-[10px]" style={{ color: errs.length ? 'var(--warn)' : 'var(--ok)' }}>
                {w.nodes.length} nodes · {errs.length ? `${errs.length} issue(s)` : 'valid DAG'}
              </div>
            </button>
          );
        })}
      </div>

      {wf && (
        <GlassPanel className="p-5">
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <input
              value={wf.name}
              onChange={(e) => upsert({ ...wf, name: e.target.value, updatedAt: new Date().toISOString() })}
              className="font-display font-semibold text-lg bg-transparent outline-none"
              style={{ color: 'var(--ink)' }}
            />
            <button onClick={() => void run(wf)} disabled={running} className="btn-primary !py-2 !px-4 text-xs" style={{ opacity: running ? 0.5 : 1 }}>
              <Play size={12} /> {running ? 'Running…' : 'Run'}
            </button>
            <button
              onClick={() => {
                download(`${wf.name.replace(/\s+/g, '-').toLowerCase()}.n8n.json`, toN8nJson(wf as WfWorkflow));
                act('workflow', `exported ${wf.name} → n8n JSON`, 'standard n8n format');
              }}
              className="btn-ghost !py-2 !px-4 text-xs"
            >
              <Download size={12} /> Export n8n JSON
            </button>
            <button
              onClick={() => download(`${wf.name.replace(/\s+/g, '-').toLowerCase()}.aetherion.json`, JSON.stringify(wf, null, 2))}
              className="btn-ghost !py-2 !px-4 text-xs"
            >
              <Download size={12} /> Lumen JSON
            </button>
            <button onClick={() => mutate((st) => ({ ...st, workflows: st.workflows.filter((x) => x.id !== wf.id) }))} className="btn-ghost !py-2 !px-3 text-xs ml-auto" style={{ color: 'var(--bad)' }}>
              <Trash2 size={12} />
            </button>
          </div>

          {/* graph strip */}
          <div className="flex items-center gap-2 overflow-x-auto pb-2 mb-4">
            {wf.nodes.map((n, i) => {
              const meta = NODE_TYPES.find((t) => t.type === n.type);
              return (
                <React.Fragment key={n.id}>
                  {i > 0 && <span style={{ color: 'var(--acc2)' }}>→</span>}
                  <div className="glass-2 px-3 py-2 shrink-0">
                    <div className="font-mono text-[9px]" style={{ color: meta?.risk === 'high' || meta?.risk === 'critical' ? 'var(--warn)' : 'var(--acc2)' }}>
                      {n.type}
                    </div>
                    <div className="text-[11px] font-medium">{n.label}</div>
                  </div>
                </React.Fragment>
              );
            })}
            <AddNodeButton wf={wf} upsert={upsert} />
          </div>

          <div className="grid md:grid-cols-2 gap-3 mb-4">
            {wf.nodes.map((n) => (
              <NodeConfig key={n.id} wf={wf} node={n} upsert={upsert} />
            ))}
          </div>

          <LogConsole lines={log.length ? log : ['run log appears here — nodes execute in topological order']} maxHeight={200} />
        </GlassPanel>
      )}
      <Modal open={open && !!wf} onClose={() => setOpen(false)} title="Workflow notes" wide>
        {wf && <p className="text-sm" style={{ color: 'var(--dim)' }}>{wf.description || 'No description yet.'}</p>}
      </Modal>
    </div>
  );
}

function waitApproval(
  ref: React.MutableRefObject<{ approvals: Array<{ id: string; status: string }> }>,
  apId: string,
): Promise<boolean> {
  return new Promise((resolve) => {
    const iv = window.setInterval(() => {
      const ap = ref.current.approvals.find((a) => a.id === apId);
      if (ap && ap.status !== 'pending') {
        window.clearInterval(iv);
        resolve(ap.status === 'approved');
      }
    }, 300);
  });
}

function AddNodeButton({ wf, upsert }: { wf: Workflow; upsert: (w: Workflow) => void }) {
  const [pick, setPick] = useState(false);
  const last = wf.nodes[wf.nodes.length - 1];
  const add = (type: string, label: string) => {
    const id = uid('n');
    upsert({
      ...wf,
      nodes: [...wf.nodes, { id, type, label, config: {} }],
      edges: last ? [...wf.edges, [last.id, id]] : wf.edges,
      updatedAt: new Date().toISOString(),
    });
    setPick(false);
  };
  return (
    <div className="relative">
      <button onClick={() => setPick(!pick)} className="btn-ghost !py-2 !px-3 text-xs shrink-0">
        <Plus size={12} /> node
      </button>
      {pick && (
        <div className="absolute z-20 top-full mt-2 left-0 glass-2 p-2 w-52 max-h-72 overflow-y-auto">
          {NODE_TYPES.map((t) => (
            <button key={t.type} onClick={() => add(t.type, t.label)} className="w-full text-left px-3 py-2 rounded-lg text-xs hover:opacity-100" style={{ background: 'transparent' }}>
              <span style={{ color: 'var(--acc2)' }}>{t.type}</span> · {t.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function NodeConfig({
  wf,
  node,
  upsert,
}: {
  wf: Workflow;
  node: { id: string; type: string; label: string; config: Record<string, string> };
  upsert: (w: Workflow) => void;
}) {
  const setConfig = (k: string, v: string) =>
    upsert({ ...wf, nodes: wf.nodes.map((n) => (n.id === node.id ? { ...n, config: { ...n.config, [k]: v } } : n)), updatedAt: new Date().toISOString() });
  const fields: Array<[string, string, string?]> =
    node.type === 'ai' ? [['prompt', 'prompt']] :
    node.type === 'http' ? [['method', 'method'], ['url', 'url']] :
    node.type === 'setVar' ? [['name', 'variable'], ['value', 'value ($output works)']] :
    node.type === 'condition' ? [['varName', 'variable'], ['value', 'equals']] :
    node.type === 'shell' ? [['command', 'command (gated)']] :
    node.type === 'notify' ? [['message', 'message']] :
    [];
  return (
    <div className="glass-2 p-3">
      <div className="flex items-center gap-2 mb-2">
        <input
          value={node.label}
          onChange={(e) => upsert({ ...wf, nodes: wf.nodes.map((n) => (n.id === node.id ? { ...n, label: e.target.value } : n)), updatedAt: new Date().toISOString() })}
          className="flex-1 bg-transparent outline-none text-xs font-medium"
          style={{ color: 'var(--ink)' }}
        />
        <span className="chip !text-[9px]">{node.type}</span>
        <button
          onClick={() =>
            upsert({
              ...wf,
              nodes: wf.nodes.filter((n) => n.id !== node.id),
              edges: wf.edges.filter(([a, b]) => a !== node.id && b !== node.id),
              updatedAt: new Date().toISOString(),
            })
          }
          className="p-1"
          style={{ color: 'var(--bad)' }}
        >
          <Trash2 size={11} />
        </button>
      </div>
      {fields.map(([k, ph]) => (
        <input key={k} value={node.config[k] ?? ''} onChange={(e) => setConfig(k, e.target.value)} placeholder={ph} className="glass-2 w-full px-3 py-1.5 text-[11px] outline-none mb-1.5 font-mono" style={{ color: 'var(--ink)' }} />
      ))}
    </div>
  );
}
