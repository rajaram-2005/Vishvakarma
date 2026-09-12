'use client';
// Lumen — Evaluation: real benchmark runs with full metrics.

import React, { useState } from 'react';
import { Gauge, Play, Save } from 'lucide-react';
import { useSutra } from '@/lib/store';
import { GlassPanel, SectionTitle, Stat, LogConsole } from '@/components/ui';
import { smokeSuite, runEvalSuite, computeMetrics, type TaskResult } from '@sutra/evaluation-sdk';
import { providerFor, reachableModels } from '@/lib/providers';
import { timeAgo, uid } from '@sutra/shared';
import type { EvalReportSummary } from '@/lib/seed';

export default function EvaluationPage() {
  const { s, mutate, act, trace } = useSutra();
  const pool = reachableModels(s.models, s.settings);
  const [modelId, setModelId] = useState(pool[0]?.id ?? '');
  const [results, setResults] = useState<TaskResult[] | null>(null);
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  const run = async (double = true) => {
    const m = pool.find((x) => x.id === modelId) ?? pool[0];
    const provider = providerFor(m, s.settings);
    if (!provider) return;
    setRunning(true);
    setResults(null);
    setLog([`▸ suite: smoke (7 tasks) · provider: ${provider.name}`]);
    const tr = trace('eval.run');
    const t0 = Date.now();
    const suite = smokeSuite();
    const first = await runEvalSuite(provider, suite, (r) => {
      setLog((l) => [...l, `  ${r.task.id}: score ${r.score} · ${r.latencyMs}ms${r.note ? ` · ${r.note}` : ''}`]);
    });
    tr.span('eval.run-1', Date.now() - t0, { provider: provider.id });
    let second: TaskResult[] | undefined;
    if (double) {
      const t1 = Date.now();
      second = await runEvalSuite(provider, suite);
      tr.span('eval.run-2', Date.now() - t1, {});
      setLog((l) => [...l, '  reproducibility: second run complete']);
    }
    const metrics = computeMetrics(first, m.costIn, m.costOut, second);
    tr.span('eval.metrics', 2);
    const id = tr.end();
    setResults(first);
    act('eval', `eval complete · ${m.name}`, `accuracy ${metrics.accuracy.toFixed(2)} · ${metrics.avgLatencyMs}ms avg`, id);
    setRunning(false);
    setMetrics(metrics);
  };

  const [metrics, setMetrics] = useState<ReturnType<typeof computeMetrics> | null>(null);

  const saveReport = () => {
    if (!metrics || !results) return;
    const m = pool.find((x) => x.id === modelId);
    const rep: EvalReportSummary = {
      id: uid('rep'),
      model: m?.name ?? modelId,
      provider: m?.runtime ?? 'unknown',
      ts: new Date().toISOString(),
      metrics,
    };
    mutate((st) => ({ ...st, evalReports: [rep, ...st.evalReports].slice(0, 20) }));
    act('eval', 'report saved', rep.model);
  };

  const pct = (v: number) => `${Math.round(v * 100)}%`;

  return (
    <div className="space-y-6">
      <SectionTitle
        overline="evaluation"
        title="Run the numbers. Every run."
        sub="Accuracy, factuality, hallucination, completion, latency, tokens, cost, security and reproducibility — computed from real runs against any reachable provider."
      />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="tasks" value="7" sub="smoke suite" />
        <Stat label="probes" value="2" sub="hallucination + refusal" tone="acc2" />
        <Stat label="runs" value={s.evalReports.length} sub="saved reports" />
        <Stat label="providers" value={pool.length} sub="reachable now" tone="ok" />
      </div>

      <GlassPanel className="p-5">
        <div className="flex flex-col md:flex-row gap-3 items-start md:items-center">
          <select value={modelId} onChange={(e) => setModelId(e.target.value)} className="glass-2 px-3 py-2 text-sm outline-none" style={{ color: 'var(--ink)' }}>
            {pool.map((m) => (
              <option key={m.id} value={m.id}>{m.name} ({m.runtime})</option>
            ))}
          </select>
          <button onClick={() => void run()} disabled={running} className="btn-primary !py-2 text-xs" style={{ opacity: running ? 0.5 : 1 }}>
            <Play size={12} /> {running ? 'Running two passes…' : 'Run suite (×2 for reproducibility)'}
          </button>
          {results && metrics && (
            <button onClick={saveReport} className="btn-ghost !py-2 !px-3 text-xs">
              <Save size={12} /> Save report
            </button>
          )}
        </div>

        <div className="mt-4">
          <LogConsole lines={log.length ? log : ['no runs yet this session']} maxHeight={170} />
        </div>

        {results && metrics && (
          <div className="mt-5">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
              <Metric label="accuracy" v={pct(metrics.accuracy)} tone={metrics.accuracy >= 0.8 ? 'ok' : 'warn'} />
              <Metric label="factuality" v={pct(metrics.factuality)} tone={metrics.factuality >= 0.8 ? 'ok' : 'warn'} />
              <Metric label="hallucination" v={pct(metrics.hallucinationRate)} tone={metrics.hallucinationRate <= 0.2 ? 'ok' : 'bad'} invert />
              <Metric label="completion" v={pct(metrics.completionRate)} />
              <Metric label="security" v={pct(metrics.securityScore)} tone={metrics.securityScore >= 0.8 ? 'ok' : 'warn'} />
              <Metric label="avg latency" v={`${metrics.avgLatencyMs}ms`} />
              <Metric label="p95 latency" v={`${metrics.p95LatencyMs}ms`} />
              <Metric label="tokens" v={String(metrics.totalTokens)} />
              <Metric label="est. cost" v={`$${metrics.estimatedCostUsd}`} />
              <Metric label="reproducibility" v={pct(metrics.reproducibility)} tone={metrics.reproducibility >= 0.8 ? 'ok' : 'warn'} />
            </div>
            <div className="glass-2 overflow-x-auto">
              <table className="w-full text-xs min-w-[560px]">
                <thead>
                  <tr className="font-mono text-[9px] tracking-widest" style={{ color: 'var(--dim)' }}>
                    <th className="text-left px-4 py-2">TASK</th>
                    <th className="text-left px-4 py-2">CATEGORY</th>
                    <th className="text-left px-4 py-2">SCORE</th>
                    <th className="text-left px-4 py-2">LATENCY</th>
                    <th className="text-left px-4 py-2">NOTE</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r) => (
                    <tr key={r.task.id} className="border-t" style={{ borderColor: 'var(--line)' }}>
                      <td className="px-4 py-2 font-medium">{r.task.name}</td>
                      <td className="px-4 py-2 font-mono" style={{ color: 'var(--acc2)' }}>{r.task.category}</td>
                      <td className="px-4 py-2" style={{ color: r.score >= 0.5 ? 'var(--ok)' : 'var(--bad)' }}>{r.score.toFixed(2)}</td>
                      <td className="px-4 py-2 font-mono" style={{ color: 'var(--dim)' }}>{r.latencyMs}ms</td>
                      <td className="px-4 py-2 truncate max-w-[200px]" style={{ color: 'var(--dim)' }}>{r.note ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </GlassPanel>

      {s.evalReports.length > 0 && (
        <GlassPanel className="p-5">
          <div className="font-mono text-[10px] tracking-widest mb-3 flex items-center gap-2" style={{ color: 'var(--acc2)' }}>
            <Gauge size={12} /> SAVED REPORTS
          </div>
          <div className="space-y-2">
            {s.evalReports.map((r) => (
              <div key={r.id} className="glass-2 p-3 flex flex-wrap items-center gap-3 text-xs">
                <span className="font-medium">{r.model}</span>
                <span className="chip !text-[9px]">{r.provider}</span>
                <span style={{ color: 'var(--dim)' }}>acc {pct(r.metrics.accuracy)} · hallu {pct(r.metrics.hallucinationRate)} · {r.metrics.avgLatencyMs}ms · ${r.metrics.estimatedCostUsd}</span>
                <span className="font-mono text-[10px] ml-auto" style={{ color: 'var(--dim)' }}>{timeAgo(r.ts)}</span>
              </div>
            ))}
          </div>
        </GlassPanel>
      )}
    </div>
  );
}

function Metric({ label, v, tone = 'acc', invert }: { label: string; v: string; tone?: 'acc' | 'ok' | 'warn' | 'bad'; invert?: boolean }) {
  const c = tone === 'ok' ? 'var(--ok)' : tone === 'warn' ? 'var(--warn)' : tone === 'bad' ? 'var(--bad)' : 'var(--acc)';
  void invert;
  return (
    <div className="glass-2 p-3">
      <div className="font-mono text-[9px] tracking-widest mb-1" style={{ color: 'var(--dim)' }}>{label.toUpperCase()}</div>
      <div className="font-display text-lg font-semibold" style={{ color: c }}>{v}</div>
    </div>
  );
}
