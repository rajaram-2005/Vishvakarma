'use client';
// Aetherion landing — MCP · GitHub · n8n · IDE · Browser · Autonomous Development.

import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Pipeline, type Step, GlowButton, LogConsole, RiskBadge } from '../ui';
import { LandingSection } from './Sections1';
import { SEED_MCP } from '@/lib/seed';
import { fetchRepo, type RepoInfo } from '@/lib/github';
import { assess } from '@sutra/shared';

/* ---------------- MCP ---------------- */

export function McpSection() {
  return (
    <LandingSection
      id="mcp"
      overline="model context protocol"
      title={
        <>
          MCP, <span className="text-grad-cyan">tamed.</span>
        </>
      }
      sub="Discover servers, install with explicit scopes, monitor health, audit every tool call and pin versions. Aetherion ships local adapters (filesystem, fetch) and speaks to remote MCP servers over stdio or HTTP."
    >
      <div className="grid md:grid-cols-2 gap-3">
        {SEED_MCP.map((s) => (
          <div key={s.id} className="glass-2 glass-hover p-5 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{
                    background: s.status === 'healthy' ? 'var(--ok)' : s.status === 'offline' ? 'var(--bad)' : 'var(--dim)',
                    boxShadow: s.status === 'healthy' ? '0 0 8px var(--ok)' : 'none',
                  }}
                />
                <span className="font-medium text-sm truncate">{s.name}</span>
              </div>
              <div className="font-mono text-[10px] mt-2" style={{ color: 'var(--dim)' }}>
                {s.transport} · v{s.version} · {s.tools.length} tools
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {s.tools.map((t) => (
                  <span key={t.name} className="chip !text-[10px]">{t.name}</span>
                ))}
              </div>
            </div>
            <span className="chip shrink-0" style={{ color: 'var(--acc2)' }}>{s.installed ? 'installed' : 'available'}</span>
          </div>
        ))}
      </div>
      <div className="mt-4 font-mono text-[10px] tracking-wider" style={{ color: 'var(--dim)' }}>
        discovery · install · permissions · health · audit · security · versioning
      </div>
    </LandingSection>
  );
}

/* ---------------- GitHub ---------------- */

export function GithubSection() {
  const [repo, setRepo] = useState<RepoInfo | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let on = true;
    setLoading(true);
    fetchRepo('rajaram-2005', 'Vishvakarma')
      .then((r) => on && setRepo(r))
      .catch((e) => on && setErr(String((e as Error)?.message ?? e)))
      .finally(() => on && setLoading(false));
    return () => {
      on = false;
    };
  }, []);

  return (
    <LandingSection
      id="github"
      overline="github"
      title={
        <>
          GitHub as a <span className="text-grad">first-class citizen.</span>
        </>
      }
      sub="Discovery, repository analysis, licenses, dependencies, security posture, capabilities, compatibility, branches, commits, issues, PRs, releases and Actions. Live data, read-only, no token needed. This card is reading the actual repository right now:"
    >
      <div className="glass p-6">
        {loading && <div className="font-mono text-xs animate-pulse-soft" style={{ color: 'var(--dim)' }}>contacting api.github.com…</div>}
        {err && <div className="font-mono text-xs" style={{ color: 'var(--dim)' }}>offline sample — {err}</div>}
        {(repo || err) && !loading && (
          <div className="grid md:grid-cols-3 gap-5">
            <div>
              <div className="font-mono text-[10px] tracking-widest mb-2" style={{ color: 'var(--acc2)' }}>REPOSITORY</div>
              {repo ? (
                <>
                  <div className="font-medium">rajaram-2005/Vishvakarma</div>
                  <div className="text-xs mt-1" style={{ color: 'var(--dim)' }}>{repo.description}</div>
                  <div className="mt-3 grid grid-cols-3 gap-2 font-mono text-xs">
                    <div><div className="text-lg font-semibold" style={{ color: 'var(--acc)' }}>{repo.stars}</div><div style={{ color: 'var(--dim)' }}>stars</div></div>
                    <div><div className="text-lg font-semibold" style={{ color: 'var(--acc)' }}>{repo.forks}</div><div style={{ color: 'var(--dim)' }}>forks</div></div>
                    <div><div className="text-lg font-semibold" style={{ color: 'var(--acc)' }}>{repo.openIssues}</div><div style={{ color: 'var(--dim)' }}>open issues</div></div>
                  </div>
                </>
              ) : (
                <div className="text-xs" style={{ color: 'var(--dim)' }}>showing offline sample data</div>
              )}
            </div>
            <div>
              <div className="font-mono text-[10px] tracking-widest mb-2" style={{ color: 'var(--acc2)' }}>ANALYSIS</div>
              <div className="space-y-1.5">
                {(repo?.capabilities ?? ['live data unavailable — cached sample']).map((c) => (
                  <div key={c} className="text-xs flex items-center gap-2">
                    <span className="w-1 h-1 rounded-full" style={{ background: 'var(--acc2)' }} />
                    <span style={{ color: 'var(--dim)' }}>{c}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="font-mono text-[10px] tracking-widest mb-2" style={{ color: 'var(--acc2)' }}>COMPATIBILITY</div>
              <div className="space-y-1.5">
                {(repo?.compat ?? ['Aetherion adapter coverage: high']).map((c) => (
                  <div key={c} className="text-xs flex items-center gap-2">
                    <span className="w-1 h-1 rounded-full" style={{ background: 'var(--acc)' }} />
                    <span style={{ color: 'var(--dim)' }}>{c}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </LandingSection>
  );
}

/* ---------------- n8n ---------------- */

export function N8nSection() {
  return (
    <LandingSection
      id="n8n"
      overline="automation bridge"
      title={
        <>
          n8n, <span className="text-grad-cyan">through a clean adapter.</span>
        </>
      }
      sub="Workflows, templates, triggers, schedules, webhooks and AI/agent workflows. Aetherion speaks n8n's format natively: author here, export standard n8n workflow JSON, or import their templates. The adapter respects n8n's terms of service — self-hosted or your own instance."
    >
      <div className="glass-2 p-6 font-mono text-xs leading-relaxed overflow-x-auto" style={{ color: 'var(--dim)' }}>
        <div style={{ color: 'var(--acc2)' }}>workflow "Nightly Evaluation"</div>
        <div>
          trigger(schedule 02:00) → ai(run smoke suite) → setVar(report) → notify(activity)
        </div>
        <div className="mt-3" style={{ color: 'var(--ink)' }}>
          ↳ exports to: <span style={{ color: 'var(--acc2)' }}>n8n-nodes-base.manualTrigger</span>, <span style={{ color: 'var(--acc2)' }}>chainLlm</span>, <span style={{ color: 'var(--acc2)' }}>set</span>, <span style={{ color: 'var(--acc2)' }}>respondToWebhook</span>
        </div>
        <div className="mt-3">standard n8n JSON · executionOrder v1 · works with self-hosted n8n</div>
      </div>
    </LandingSection>
  );
}

/* ---------------- IDE ---------------- */

const IDE_TREE = [
  ['src/app.tsx', 'active'],
  ['src/core.ts', ''],
  ['src/router.ts', ''],
  ['tests/app.test.ts', ''],
  ['package.json', ''],
  ['README.md', ''],
];

export function IdeSection() {
  return (
    <LandingSection
      overline="developer workspace"
      title={
        <>
          A premium IDE. <span className="text-grad">Agents included.</span>
        </>
      }
      sub="File Tree · Code Editor · AI Agent, with Terminal, Tests, Git, Browser, Logs and Security along the bottom. The IDE in the workspace is real: edit the virtual filesystem, run deterministic checks, commit, and let agents work alongside you."
    >
      <div className="glass !rounded-[22px] overflow-hidden">
        <div className="flex border-b" style={{ borderColor: 'var(--line)' }}>
          <div className="w-40 md:w-52 p-3 hidden sm:block">
            <div className="font-mono text-[9px] tracking-widest mb-2" style={{ color: 'var(--dim)' }}>EXPLORER</div>
            {IDE_TREE.map(([f, st]) => (
              <div
                key={f}
                className="font-mono text-[10.5px] px-2 py-1 rounded truncate"
                style={st === 'active' ? { background: 'color-mix(in srgb, var(--acc) 16%, transparent)', color: 'var(--ink)' } : { color: 'var(--dim)' }}
              >
                {f}
              </div>
            ))}
          </div>
          <div className="flex-1 p-4 font-mono text-[10.5px] leading-relaxed" style={{ color: 'var(--dim)' }}>
            <div><span style={{ color: '#c084fc' }}>import</span> {'{ AetherionCore }'} <span style={{ color: '#c084fc' }}>from</span> <span style={{ color: '#67e8f9' }}>"./core"</span>;</div>
            <div>&nbsp;</div>
            <div><span style={{ color: '#c084fc' }}>export default function</span> <span style={{ color: '#fbbf24' }}>App</span>() {'{'}</div>
            <div>&nbsp;&nbsp;<span style={{ color: '#c084fc' }}>const</span> core = <span style={{ color: '#c084fc' }}>new</span> <span style={{ color: '#fbbf24' }}>AetherionCore</span>({'{ mode: '}<span style={{ color: '#67e8f9' }}>"local"</span>{' }'});</div>
            <div>&nbsp;&nbsp;core.<span style={{ color: '#fbbf24' }}>connect</span>();</div>
            <div>&nbsp;&nbsp;<span style={{ color: '#c084fc' }}>return</span> (&lt;main&gt;&lt;h1&gt;Aetherion&lt;/h1&gt;&lt;/main&gt;);</div>
            <div>{'}'}</div>
          </div>
          <div className="w-48 p-3 hidden md:block border-l" style={{ borderColor: 'var(--line)' }}>
            <div className="font-mono text-[9px] tracking-widest mb-2" style={{ color: 'var(--dim)' }}>AI AGENT</div>
            <div className="glass-2 p-2 text-[10px] leading-relaxed" style={{ color: 'var(--dim)' }}>
              ▸ analyzed src/app.tsx
              <br />
              ▸ suggests: extract core into context provider
              <br />
              <span style={{ color: 'var(--ok)' }}>2 checks pass · 1 warn</span>
            </div>
          </div>
        </div>
        <div className="flex border-t font-mono text-[10px]" style={{ borderColor: 'var(--line)', color: 'var(--dim)' }}>
          {['TERMINAL', 'TESTS', 'GIT', 'BROWSER', 'LOGS', 'SECURITY'].map((t) => (
            <div key={t} className="px-4 py-2 tracking-widest">{t}</div>
          ))}
        </div>
      </div>
    </LandingSection>
  );
}

/* ---------------- Browser ---------------- */

export function BrowserSection() {
  return (
    <LandingSection
      overline="browser automation"
      title={
        <>
          Browsers become <span className="text-grad-cyan">tools.</span>
        </>
      }
      sub="Navigate, click, extract, verify. Isolated sessions, policy-filtered domains, screenshots as evidence in traces. The Browser tab shows what the agent sees — and every action is audited."
    >
      <div className="glass-2 p-5 max-w-2xl">
        <div className="flex items-center gap-2 mb-4">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: 'var(--bad)', opacity: 0.7 }} />
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: 'var(--warn)', opacity: 0.7 }} />
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: 'var(--ok)', opacity: 0.7 }} />
          <div className="glass-2 flex-1 px-3 py-1.5 font-mono text-[10px] truncate" style={{ color: 'var(--dim)' }}>
            https://example.com/docs — isolated session · domain policy: allow
          </div>
        </div>
        <div className="space-y-2 font-mono text-[10.5px]" style={{ color: 'var(--dim)' }}>
          <div><span style={{ color: 'var(--acc2)' }}>› navigate</span> https://example.com/docs <span style={{ color: 'var(--ok)' }}>200 · 312ms</span></div>
          <div><span style={{ color: 'var(--acc2)' }}>› extract</span> h1, code — 4 elements captured</div>
          <div><span style={{ color: 'var(--acc2)' }}>› screenshot</span> → trace #b72e · attached as evidence</div>
          <div><span style={{ color: 'var(--acc2)' }}>› verify</span> "Aetherion" visible in viewport ✓</div>
        </div>
      </div>
    </LandingSection>
  );
}

/* ---------------- Autonomous development ---------------- */

const AUTO_STEPS: Step[] = [
  { id: 's1', label: 'Goal' },
  { id: 's2', label: 'Architect' },
  { id: 's3', label: 'Planner' },
  { id: 's4', label: 'Coder' },
  { id: 's5', label: 'Terminal' },
  { id: 's6', label: 'Browser' },
  { id: 's7', label: 'Tester' },
  { id: 's8', label: 'Security' },
  { id: 's9', label: 'Reviewer' },
  { id: 's10', label: 'Approval' },
  { id: 's11', label: 'Deploy' },
];

const AUTO_LOGS: Record<string, string[]> = {
  s1: ['goal received: "add a debounce utility to the core"'],
  s2: ['ARCHITECTURE.md updated: utility lives in src/utils.ts', 'no new dependencies'],
  s3: ['plan: 3 tasks — implement, test, docs'],
  s4: ['src/utils.ts written (+22 lines)', 'src/app.tsx imports updated'],
  s5: ['$ ls src → app.tsx core.ts router.ts utils.ts', '$ npm test (sandbox) → exit 0'],
  s6: ['preview at aetherion://local — no console errors', 'screenshot attached to trace'],
  s7: ['2 tests added · 4/4 pass', 'bracket balance ✓ · imports ✓'],
  s8: ['secret scan: clean', 'risk classification: low (workspace write)'],
  s9: ['review: +38 −2 · no scope creep', 'notes: name consistency OK'],
  s10: ['approval requested — review the diff', 'allow once · allow session · inspect'],
  s11: ['bundle built · hash 7c21f0a', 'deployed → aetherion://local/7c21f0a · health 200'],
};

export function AutonomousSection() {
  const [log, setLog] = useState<string[]>([]);
  const [phase, setPhase] = useState<'idle' | 'running' | 'awaiting' | 'done'>('idle');
  const [stepIdx, setStepIdx] = useState(-1);
  const [doneUpTo, setDoneUpTo] = useState(-1);

  const run = async () => {
    if (phase === 'running' || phase === 'awaiting') return;
    setLog([]);
    setPhase('running');
    for (let i = 0; i < AUTO_STEPS.length; i++) {
      const step = AUTO_STEPS[i];
      setStepIdx(i);
      setLog((l) => [...l, `▸ ${step.label}`, ...(AUTO_LOGS[step.id] ?? []).map((x) => `    ${x}`)]);
      if (step.id === 's10') {
        setPhase('awaiting');
        return; // wait for the human — this is the point
      }
      await new Promise((r) => setTimeout(r, 520));
      setDoneUpTo(i);
    }
  };

  const approve = () => {
    setDoneUpTo(9);
    setPhase('running');
    setLog((l) => [...l, '✓ approved: allow once']);
    setStepIdx(10);
    setLog((l) => [...l, '▸ Deploy', ...(AUTO_LOGS.s11 ?? []).map((x) => `    ${x}`)]);
    setTimeout(() => {
      setDoneUpTo(10);
      setStepIdx(-1);
      setPhase('done');
      setLog((l) => [...l, 'pipeline complete · 11/11 steps · 1 approval · trace recorded']);
    }, 560);
  };

  return (
    <LandingSection
      overline="autonomous development"
      title={
        <>
          From goal to <span className="text-grad">deployed</span> — with a human in the loop.
        </>
      }
      sub="The autonomous pipeline runs the full chain: Goal → Architect → Planner → Coder → Terminal → Browser → Tester → Security → Reviewer → Approval → Deploy. Watch it stop at Approval. That is not a bug. That is the product."
    >
      <div className="glass p-5 md:p-7">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div className="font-mono text-[10px] tracking-widest" style={{ color: 'var(--acc2)' }}>
            GOAL → ARCHITECT → PLANNER → CODER → TERMINAL → BROWSER → TESTER → SECURITY → REVIEWER → APPROVAL → DEPLOY
          </div>
          <GlowButton onClick={() => void run()} disabled={phase === 'running' || phase === 'awaiting'}>
            {phase === 'done' ? 'Run again' : 'Run pipeline'}
          </GlowButton>
        </div>
        <Pipeline steps={AUTO_STEPS} compact activeIdx={stepIdx} doneUpTo={doneUpTo} />
        <div className="mt-5 grid md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <LogConsole lines={log} maxHeight={240} />
          </div>
          <div>
            {phase === 'awaiting' && (
              <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="glass-2 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <RiskBadge risk="medium" />
                  <span className="text-sm font-medium">Deployment approval</span>
                </div>
                <p className="text-xs mb-4" style={{ color: 'var(--dim)' }}>
                  Deploy bundle 7c21f0a to local target. 1 file changed, +38 −2. Secret scan clean.
                </p>
                <div className="flex gap-2">
                  <button onClick={approve} className="btn-primary !py-2 !px-3 text-xs">Allow once</button>
                  <button onClick={approve} className="btn-ghost !py-2 !px-3 text-xs">Inspect</button>
                </div>
              </motion.div>
            )}
            {phase !== 'awaiting' && (
              <div className="glass-2 p-4 text-xs leading-relaxed" style={{ color: 'var(--dim)' }}>
                {phase === 'done' ? (
                  <>Pipeline finished. The diff, tests, scan and deploy are all in the trace. Nothing ran silently.</>
                ) : (
                  <>The pipeline is fully live in the workspace: it writes real files to the project, runs the checks, and asks before deploying. Press <span style={{ color: 'var(--ink)' }}>Run pipeline</span>.</>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </LandingSection>
  );
}

/* ---------------- security scanner (used by section 4) ---------------- */

export function CommandScanner({ command, setCommand }: { command: string; setCommand: (v: string) => void }) {
  const a = assess('terminal.exec', command);
  return (
    <div className="glass p-5">
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          className="glass-2 flex-1 px-4 py-3 font-mono text-xs outline-none"
          style={{ color: 'var(--ink)' }}
          placeholder='try:  rm -rf /  ·  git push --force  ·  npm test'
          spellCheck={false}
        />
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <RiskBadge risk={a.risk} />
        <span className="text-xs" style={{ color: a.requiresApproval ? 'var(--warn)' : 'var(--ok)' }}>
          {a.requiresApproval ? '→ routed to approval queue (never silent)' : '→ allowed by policy'}
        </span>
      </div>
      <div className="mt-2 space-y-1">
        {a.reasons.map((r) => (
          <div key={r} className="font-mono text-[10.5px]" style={{ color: 'var(--dim)' }}>· {r}</div>
        ))}
      </div>
    </div>
  );
}
