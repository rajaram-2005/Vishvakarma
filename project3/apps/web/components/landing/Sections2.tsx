'use client';
// Aetherion landing — Agents · Teams · Skills · Memory · RAG · Tools.

import React, { useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Pipeline, type Step, GlowButton, LogConsole } from '../ui';
import { LandingSection } from './Sections1';
import { SEED_AGENTS, SEED_SKILLS, SEED_TEAMS, SAMPLE_DOC_TEXT } from '@/lib/seed';
import { ingestText, retrieve, generate } from '@/lib/rag';
import { DEFAULT_SETTINGS, SEED_MODELS } from '@/lib/seed';
import type { Hit } from '@/lib/rag';

/* ---------------- agents ---------------- */

const AGENT_STEPS: Step[] = [
  { id: 'a1', label: 'Understand' },
  { id: 'a2', label: 'Plan' },
  { id: 'a3', label: 'Tools' },
  { id: 'a4', label: 'Execute' },
  { id: 'a5', label: 'Observe' },
  { id: 'a6', label: 'Verify' },
  { id: 'a7', label: 'Repair' },
  { id: 'a8', label: 'Finalize' },
];

const AGENT_LOG: Record<string, string[]> = {
  a1: ['reading goal + context…', 'intent: implement a focused change'],
  a2: ['decomposing into 3 subtasks', 'selecting tools: fs.read, fs.write, terminal'],
  a3: ['gateway: all tools low-risk → allowed', 'sandbox: workspace boundary active'],
  a4: ['applying change to src/core.ts', 'writing tests/app.test.ts'],
  a5: ['observing outputs… no exceptions', 'diff: +18 −4 lines'],
  a6: ['running checks: brackets ✓ json ✓ imports ✓', 'verdict: PASS'],
  a7: ['nothing to repair (checks green)'],
  a8: ['summary written · trace recorded', 'ready for human review'],
};

export function AgentsSection() {
  const rm = useReducedMotion();
  const [log, setLog] = useState<string[]>([]);
  const runAgent = async () => {
    setLog([]);
    for (let i = 0; i < AGENT_STEPS.length; i++) {
      setLog((l) => [...l, `▸ ${AGENT_STEPS[i].label}`, ...(AGENT_LOG[AGENT_STEPS[i].id] ?? []).map((x) => `    ${x}`)]);
      await new Promise((r) => setTimeout(r, rm ? 60 : 480));
    }
    setLog((l) => [...l, 'agent run complete · 8/8 steps · 0 approvals needed']);
  };
  return (
    <LandingSection
      id="agents"
      overline="agents"
      title={
        <>
          Agents that <span className="text-grad-cyan">think in loops,</span> not one-shots.
        </>
      }
      sub="Understand → Plan → Tools → Execute → Observe → Verify → Repair → Finalize. Each step is traced, each tool call is risk-classified, and sub-agents inherit permissions — never exceed them. Agent teams coordinate through an orchestrator with explicit handoffs."
    >
      <div className="glass p-5 md:p-7">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div>
            <div className="font-mono text-[10px] tracking-widest mb-1" style={{ color: 'var(--acc2)' }}>AGENT LOOP · LIVE DEMO</div>
            <div className="text-sm" style={{ color: 'var(--dim)' }}>“Fix the debounce bug in src/core.ts and prove it with a test.”</div>
          </div>
          <GlowButton onClick={() => void runAgent()}>Run the loop</GlowButton>
        </div>
        <Pipeline steps={AGENT_STEPS} compact />
        <div className="mt-5">
          <LogConsole lines={log} maxHeight={220} />
        </div>
        <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3">
          {SEED_AGENTS.slice(0, 4).map((a) => (
            <div key={a.id} className="glass-2 p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: a.color, boxShadow: `0 0 10px ${a.color}` }} />
                <span className="font-medium text-sm">{a.name}</span>
              </div>
              <div className="text-[11px]" style={{ color: 'var(--dim)' }}>{a.role}</div>
            </div>
          ))}
        </div>
      </div>
    </LandingSection>
  );
}

/* ---------------- teams ---------------- */

export function TeamsSection() {
  return (
    <LandingSection
      overline="agent teams"
      title={
        <>
          Swarms of specialists, <span className="text-grad">one orchestrator.</span>
        </>
      }
      sub="A team is a goal, an orchestrator and named members with scoped permissions. Work is decomposed, delegated and verified — sub-agents can spawn sub-agents within budget, and every handoff lands in the trace."
    >
      <div className="grid md:grid-cols-2 gap-4">
        {SEED_TEAMS.map((t) => (
          <div key={t.id} className="glass glass-hover p-6">
            <div className="font-mono text-[10px] tracking-widest mb-2" style={{ color: 'var(--acc2)' }}>TEAM</div>
            <div className="font-display text-xl font-semibold">{t.name}</div>
            <p className="text-sm mt-2" style={{ color: 'var(--dim)' }}>{t.goal}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {t.members.map((m) => {
                const a = SEED_AGENTS.find((x) => x.id === m);
                if (!a) return null;
                return (
                  <span key={m} className="chip">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: a.color }} />
                    {a.name}
                    {m === t.orchestrator && <span style={{ color: 'var(--acc2)' }}> · lead</span>}
                  </span>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </LandingSection>
  );
}

/* ---------------- skills ---------------- */

export function SkillsSection() {
  return (
    <LandingSection
      overline="skills"
      title={
        <>
          <span className="text-grad">Skills = HOW.</span>
        </>
      }
      sub="A skill is a packaged method: review like this, test like this, respond like this. Install one and every agent that requests the scope can use it. Skills version, license and declare their own permission scopes."
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {SEED_SKILLS.slice(0, 8).map((s) => (
          <div key={s.id} className={`glass-2 p-4 ${s.installed ? '' : 'opacity-60'}`}>
            <div className="flex items-center justify-between mb-2">
              <span className="font-mono text-[10px]" style={{ color: s.installed ? 'var(--ok)' : 'var(--dim)' }}>
                {s.installed ? '● installed' : '○ available'}
              </span>
              <span className="font-mono text-[10px]" style={{ color: 'var(--dim)' }}>v{s.version}</span>
            </div>
            <div className="font-medium text-sm">{s.name}</div>
            <div className="text-[11px] mt-1 leading-relaxed" style={{ color: 'var(--dim)' }}>{s.description.slice(0, 90)}…</div>
          </div>
        ))}
      </div>
    </LandingSection>
  );
}

/* ---------------- memory ---------------- */

export function MemorySection() {
  const items = [
    ['fact', 'Project 3 is codenamed Aetherion — the open AI ecosystem workspace.'],
    ['preference', 'Local-first: no data leaves the machine without an explicit opt-in.'],
    ['episodic', '“Fix debounce bug” — resolved 14:02, trace #a41f, 0 approvals.'],
  ];
  return (
    <LandingSection
      overline="memory"
      title={
        <>
          <span className="text-grad-cyan">Memory = WHAT.</span>
        </>
      }
      sub="Skills teach the method; memory stores what the system knows about you and the project — facts, preferences, episodes. Say “remember that I prefer TypeScript” in chat and it is stored, retrieved where relevant, and visible in Memory at any time."
    >
      <div className="glass-2 p-6 space-y-3 max-w-2xl">
        {items.map(([k, v]) => (
          <div key={k} className="flex items-start gap-3">
            <span className="chip mt-0.5 shrink-0" style={{ color: 'var(--acc2)' }}>{k}</span>
            <span className="text-sm" style={{ color: 'var(--dim)' }}>{v}</span>
          </div>
        ))}
        <div className="text-xs pt-2" style={{ color: 'var(--dim)' }}>
          Stored locally (or Puter KV when you opt in) · searchable by similarity · exportable and deletable.
        </div>
      </div>
    </LandingSection>
  );
}

/* ---------------- RAG ---------------- */

const RAG_STEPS: Step[] = [
  { id: 'g1', label: 'Ingest' },
  { id: 'g2', label: 'Parse' },
  { id: 'g3', label: 'Chunk' },
  { id: 'g4', label: 'Embed' },
  { id: 'g5', label: 'Retrieve' },
  { id: 'g6', label: 'Rerank' },
  { id: 'g7', label: 'Context' },
  { id: 'g8', label: 'Generate' },
  { id: 'g9', label: 'Cite' },
];

export function RagSection() {
  const [q, setQ] = useState('What is the security model for tool calls?');
  const [answer, setAnswer] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [busy, setBusy] = useState(false);

  const doc = useMemo(() => ingestText('Aetherion Design Principles', SAMPLE_DOC_TEXT, 'bundled document', 'text'), []);

  const ask = async () => {
    setBusy(true);
    setAnswer('');
    setHits([]);
    try {
      const r = await generate(doc.chunks, q, SEED_MODELS, DEFAULT_SETTINGS);
      setHits(r.hits.slice(0, 3));
      setAnswer(r.answer);
    } catch (e) {
      setAnswer(String((e as Error)?.message ?? e));
    }
    setBusy(false);
  };

  return (
    <LandingSection
      id="rag"
      overline="knowledge · rag"
      title={
        <>
          Knowledge, <span className="text-grad">grounded and cited.</span>
        </>
      }
      sub="Documents, websites, GitHub, databases, APIs and folders flow through one pipeline. Embeddings and reranking run locally; generation cites its sources. This demo is live — it just ingested the Aetherion design document into your browser."
    >
      <Pipeline steps={RAG_STEPS} compact />
      <div className="mt-8 glass p-5 md:p-6">
        <div className="flex flex-col md:flex-row gap-3">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void ask()}
            className="glass-2 flex-1 px-4 py-3 text-sm outline-none"
            style={{ color: 'var(--ink)' }}
            placeholder="ask the knowledge base…"
          />
          <GlowButton onClick={() => void ask()} disabled={busy}>
            {busy ? 'Retrieving…' : 'Ask (live)'}
          </GlowButton>
        </div>
        {answer && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-5 grid md:grid-cols-5 gap-4">
            <div className="md:col-span-3 glass-2 p-4 text-sm leading-relaxed whitespace-pre-wrap">{answer}</div>
            <div className="md:col-span-2 space-y-2">
              {hits.map((h, i) => (
                <div key={h.chunk.id} className="glass-2 p-3">
                  <div className="font-mono text-[10px] mb-1" style={{ color: 'var(--acc2)' }}>
                    [{i + 1}] {h.chunk.heading} · score {h.score.toFixed(2)}
                  </div>
                  <div className="text-[11px] leading-relaxed line-clamp-3" style={{ color: 'var(--dim)' }}>{h.chunk.text}</div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
        <div className="mt-4 font-mono text-[10px] tracking-wider" style={{ color: 'var(--dim)' }}>
          {doc.chunks.length} chunks · 384-dim local embeddings · BM25 rerank blend · sources: documents · websites · github · databases · apis · folders
        </div>
      </div>
    </LandingSection>
  );
}

/* ---------------- tools ---------------- */

const TOOLS = [
  ['Filesystem', 'isolated read/write', 'low'],
  ['Terminal', 'sandboxed shell', 'medium'],
  ['Browser', 'automation + verify', 'medium'],
  ['Git', 'branch · commit · push', 'medium'],
  ['APIs', 'typed HTTP + retry', 'medium'],
  ['Databases', 'SQL + document stores', 'high'],
  ['Documents', 'pdf · md · office', 'low'],
  ['Code Exec', 'disposable sandbox', 'high'],
  ['Computer Use', 'GUI-level control', 'high'],
  ['Deployment', 'local · docker · puter', 'critical'],
];

export function ToolsSection() {
  return (
    <LandingSection
      id="tools"
      overline="tools"
      title={
        <>
          A full arsenal. <span className="text-grad-cyan">Gated by policy.</span>
        </>
      }
      sub="Every tool declares its risk and sandbox level. The gateway classifies each call at execution time; anything above low risk can stop for a human. That is not a feature list — it is the operating discipline."
    >
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {TOOLS.map(([name, desc, risk]) => (
          <div key={name} className="glass-2 glass-hover p-4">
            <div className="font-medium text-sm mb-1">{name}</div>
            <div className="text-[11px] mb-3" style={{ color: 'var(--dim)' }}>{desc}</div>
            <span className={`chip risk-${risk}`}>{risk}</span>
          </div>
        ))}
      </div>
    </LandingSection>
  );
}
