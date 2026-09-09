'use client';
// SUTRA landing — Security · Evaluation · Observability · Deployment ·
// Puter · Desktop · Mobile · Marketplace · Enterprise · Privacy · Final.

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { ArrowRight, ExternalLink } from 'lucide-react';
import { Pipeline, type Step, Stat } from '../ui';
import { LandingSection } from './Sections1';
import { CommandScanner } from './Sections3';
import { TraceWaterfall } from '../workspace/TraceWaterfall';
import { DEFAULT_SAMPLE_TRACE } from '@/lib/sample-trace';

/* ---------------- security ---------------- */

const GW_STEPS: Step[] = [
  { id: 'g1', label: 'Agent' },
  { id: 'g2', label: 'Tool Gateway' },
  { id: 'g3', label: 'Policy' },
  { id: 'g4', label: 'Sandbox' },
  { id: 'g5', label: 'Execution' },
];

export function SecuritySection() {
  const [cmd, setCmd] = useState('git push --force origin main');
  return (
    <LandingSection
      id="security"
      overline="security"
      title={
        <>
          Safe by construction. <span className="text-grad-cyan">Loud by policy.</span>
        </>
      }
      sub="Agent → Tool Gateway → Policy → Sandbox → Execution. Filesystem isolation, network policies, resource limits, secret isolation, auditing and approvals. Risk is classified — Low / Medium / High / Critical — and anything dangerous is never silent. Scan a command:"
    >
      <div className="grid lg:grid-cols-2 gap-5 items-start">
        <div>
          <Pipeline steps={GW_STEPS} compact />
          <div className="grid grid-cols-2 gap-3 mt-5">
            <div className="glass-2 p-4">
              <div className="font-mono text-[10px] tracking-widest mb-2" style={{ color: 'var(--dim)' }}>FILESYSTEM</div>
              <div className="text-xs" style={{ color: 'var(--dim)' }}>workspace-isolated · path escapes blocked · deletions gated</div>
            </div>
            <div className="glass-2 p-4">
              <div className="font-mono text-[10px] tracking-widest mb-2" style={{ color: 'var(--dim)' }}>NETWORK</div>
              <div className="text-xs" style={{ color: 'var(--dim)' }}>domain policy · egress logged · local mode = zero egress</div>
            </div>
            <div className="glass-2 p-4">
              <div className="font-mono text-[10px] tracking-widest mb-2" style={{ color: 'var(--dim)' }}>SECRETS</div>
              <div className="text-xs" style={{ color: 'var(--dim)' }}>masked in terminals · isolated store · access is an approval-class event</div>
            </div>
            <div className="glass-2 p-4">
              <div className="font-mono text-[10px] tracking-widest mb-2" style={{ color: 'var(--dim)' }}>AUDIT</div>
              <div className="text-xs" style={{ color: 'var(--dim)' }}>every call, classification, reason and decision · exportable</div>
            </div>
          </div>
          <div className="mt-4 glass-2 p-4">
            <div className="font-mono text-[10px] tracking-widest mb-2" style={{ color: 'var(--dim)' }}>APPROVALS</div>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="chip">allow once</span>
              <span className="chip">allow session</span>
              <span className="chip">inspect</span>
              <span className="chip" style={{ color: 'var(--bad)' }}>deny</span>
              <span style={{ color: 'var(--dim)' }}>· session grants expire when you close the tab</span>
            </div>
          </div>
        </div>
        <CommandScanner command={cmd} setCommand={setCmd} />
      </div>
    </LandingSection>
  );
}

/* ---------------- evaluation ---------------- */

export function EvaluationSection() {
  const metrics: Array<[string, string, string]> = [
    ['accuracy', 'measured against expected outcomes', 'acc'],
    ['factuality', 'grounded claims vs probes', 'acc2'],
    ['hallucination', 'refusal on unknown entities', 'acc2'],
    ['completion', 'non-empty valid responses', 'acc'],
    ['latency', 'avg + p95 per task', 'acc2'],
    ['tokens', 'in/out accounting', 'acc'],
    ['memory', 'context utilization', 'acc'],
    ['tool success', 'gateway-passed calls', 'acc2'],
    ['security', 'refusal & boundary compliance', 'acc'],
    ['cost', 'estimated USD per run', 'acc2'],
    ['reproducibility', 'two-run stability', 'acc'],
  ];
  return (
    <LandingSection
      overline="evaluation"
      title={
        <>
          Measure <span className="text-grad">everything.</span>
        </>
      }
      sub="Models, agents, tools, skills, workflows, plugins and RAG — all benchmarkable. Run suites against any reachable provider, get the full metric panel, and save reports for trend lines. This is the discipline that keeps “AI” from becoming vibes."
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {metrics.map(([name, desc]) => (
          <div key={name} className="glass-2 p-4">
            <div className="font-mono text-[10px] tracking-widest mb-1" style={{ color: 'var(--acc2)' }}>{name}</div>
            <div className="text-[11px]" style={{ color: 'var(--dim)' }}>{desc}</div>
          </div>
        ))}
      </div>
      <div className="mt-5 glass p-5 flex flex-wrap items-center gap-4">
        <Stat label="smoke suite" value="7 tasks" sub="math · sentiment · extraction · code · JSON · hallucination probe · refusal" tone="acc2" />
        <Stat label="last local run" value="1.000" sub="accuracy · Sutra Local · 0.4s · $0.00" tone="ok" />
        <Stat label="reproducibility" value="100%" sub="deterministic two-run stability" tone="acc" />
        <div className="flex-1 min-w-[200px] text-xs self-center" style={{ color: 'var(--dim)' }}>
          → the workspace runs these for real: pick a provider, press run, inspect per-task verdicts, export the report.
        </div>
      </div>
    </LandingSection>
  );
}

/* ---------------- observability ---------------- */

export function ObservabilitySection() {
  return (
    <LandingSection
      overline="observability"
      title={
        <>
          See <span className="text-grad-cyan">every thought.</span>
        </>
      }
      sub="Traces follow the exact shape of your system: Request → Router → Model → Agent → Tool → Workflow → Database → Response. OpenTelemetry-compatible spans export to any OTLP collector; Prometheus-style metrics come from the API service."
    >
      <div className="glass p-5 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="font-mono text-[10px] tracking-widest" style={{ color: 'var(--acc2)' }}>
            TRACE · chat.request · 412ms
          </div>
          <div className="flex gap-2">
            <span className="chip">OTel-compatible</span>
            <span className="chip">OTLP export</span>
            <span className="chip">Prometheus /metrics</span>
          </div>
        </div>
        <TraceWaterfall trace={DEFAULT_SAMPLE_TRACE} />
      </div>
    </LandingSection>
  );
}

/* ---------------- deployment ---------------- */

export function DeploymentSection() {
  const targets = [
    ['local', 'instant bundle to your machine, health probed', 'always on'],
    ['docker', 'generated multi-stage Dockerfile + compose', 'one command'],
    ['puter cloud', 'real Puter cloud FS write when you opt in', 'optional'],
  ];
  return (
    <LandingSection
      overline="deployment"
      title={
        <>
          Ship <span className="text-grad">anywhere.</span>
        </>
      }
      sub="Validate → static checks → secret scan → bundle → target → health check. Pre-deploy scans are mandatory: a bundle containing a secret pattern never ships. Every deploy keeps a log and a rollback note."
    >
      <div className="grid md:grid-cols-3 gap-3">
        {targets.map(([name, desc, tag]) => (
          <div key={name} className="glass glass-hover p-5">
            <div className="font-mono text-[10px] tracking-widest mb-2" style={{ color: 'var(--acc2)' }}>{name}</div>
            <div className="text-sm">{desc}</div>
            <div className="mt-3"><span className="chip">{tag}</span></div>
          </div>
        ))}
      </div>
    </LandingSection>
  );
}

/* ---------------- Puter ---------------- */

export function PuterSection() {
  return (
    <LandingSection
      id="puter"
      overline="optional infrastructure"
      title={
        <>
          Powered, optionally, by <span className="text-grad-cyan">Puter.</span>
        </>
      }
      sub="SUTRA is local-first. Puter.js is an optional layer for authentication, KV persistence, cloud filesystem, AI, hosting and task management — used only where it helps, and never required. Local mode never forces Puter authentication."
    >
      <div className="glass p-6 md:p-8">
        <div className="grid md:grid-cols-2 gap-6 items-center">
          <div>
            <div className="font-mono text-[10px] tracking-widest mb-3" style={{ color: 'var(--acc2)' }}>REAL FEATURE · LIVE IN THE WORKSPACE</div>
            <h3 className="font-display text-2xl font-semibold mb-3">An AI-powered To-Do, persisted to Puter KV.</h3>
            <ul className="text-sm space-y-2" style={{ color: 'var(--dim)' }}>
              {['create / edit / delete · complete / uncomplete', 'priority · category · tags · due dates', 'search · filter · sort · archive / restore · reorder', 'project association · “Plan my Project 3 MVP.” as a command'].map((t) => (
                <li key={t} className="flex gap-2"><span style={{ color: 'var(--acc)' }}>◆</span> {t}</li>
              ))}
            </ul>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/workspace/projects" className="btn-primary">Open the To-Do <ArrowRight size={14} /></Link>
            </div>
            <a
              href="https://developer.puter.com"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 mt-6 font-mono text-[11px] tracking-wider transition-opacity hover:opacity-100"
              style={{ color: 'var(--dim)', opacity: 0.8 }}
            >
              Powered by Puter <ExternalLink size={11} />
            </a>
          </div>
          <div className="glass-2 p-4 font-mono text-[11px] leading-relaxed" style={{ color: 'var(--dim)' }}>
            <div style={{ color: 'var(--acc2)' }}>✓ Plan my Project 3 MVP.</div>
            <div className="mt-2">→ 16 tasks generated (structured)</div>
            <div>→ priorities P0–P2 · owners assigned</div>
            <div>→ due dates 1–12 days out</div>
            <div className="mt-2">you: accept 14 · edit 2 · reject 0</div>
            <div style={{ color: 'var(--ok)' }}>→ persisted → puter.kv.set("sutra:tasks:prj-3")</div>
            <div className="mt-2">local mode: localStorage (same interface)</div>
            <div>no auth required · sync is opt-in</div>
          </div>
        </div>
      </div>
    </LandingSection>
  );
}

/* ---------------- desktop / mobile ---------------- */

export function DesktopSection() {
  return (
    <LandingSection
      overline="desktop"
      title={
        <>
          On your machine. <span className="text-grad-cyan">Really.</span>
        </>
      }
      sub="A Tauri shell around the same workspace core: real filesystem access (still sandboxed), native menus, system tray, global hotkeys for the agent. Windows, macOS, Linux — one codebase."
    >
      <div className="grid grid-cols-3 gap-3">
        {[['Windows', 'tauri · nsis installer'], ['macOS', 'tauri · universal binary'], ['Linux', 'tauri · appimage + deb']].map(([os, d]) => (
          <div key={os} className="glass glass-hover p-5 text-center">
            <div className="font-display text-lg font-semibold">{os}</div>
            <div className="font-mono text-[10px] mt-1" style={{ color: 'var(--dim)' }}>{d}</div>
          </div>
        ))}
      </div>
    </LandingSection>
  );
}

export function MobileSection() {
  return (
    <LandingSection
      overline="mobile"
      title={
        <>
          Your AI <span className="text-grad">control center.</span>
        </>
      }
      sub="Not a shrunken desktop. Mobile is for commanding: approve requests, run a goal, check agent status, query the knowledge base, and watch traces land. iOS and Android from one React Native surface."
    >
      <div className="glass-2 p-5 max-w-md mx-auto">
        <div className="font-mono text-[10px] tracking-widest mb-3" style={{ color: 'var(--dim)' }}>SUTRA · CONTROL CENTER</div>
        <div className="space-y-2.5">
          <div className="flex items-center justify-between glass-2 px-3 py-2.5">
            <span className="text-xs">MVP Squad running</span>
            <span className="chip" style={{ color: 'var(--ok)' }}>step 6/8</span>
          </div>
          <div className="flex items-center justify-between glass-2 px-3 py-2.5">
            <span className="text-xs">Approval waiting</span>
            <span className="chip risk-high">deploy</span>
          </div>
          <div className="flex items-center justify-between glass-2 px-3 py-2.5">
            <span className="text-xs">Nightly eval</span>
            <span className="chip" style={{ color: 'var(--acc2)' }}>1.000 acc</span>
          </div>
          <div className="flex items-center justify-between glass-2 px-3 py-2.5">
            <span className="text-xs">Knowledge base</span>
            <span className="chip">42 chunks</span>
          </div>
        </div>
      </div>
    </LandingSection>
  );
}

/* ---------------- marketplace ---------------- */

export function MarketplaceSection() {
  const items = [
    ['skill', 'Incident Response', 'v1.0.1'],
    ['plugin', 'Linear Bridge', 'v0.3.0'],
    ['workflow', 'On-Call Handoff', 'v1.1.0'],
    ['mcp', 'Sentry', 'v1.4.0'],
    ['skill', 'RAG Tuning', 'v1.0.0'],
    ['model', 'Phi-4 Mini', 'v4.0'],
    ['workflow', 'Weekly Digest', 'v0.9.0'],
    ['plugin', 'Notion Sync', 'v1.2.3'],
  ];
  return (
    <LandingSection
      overline="marketplace"
      title={
        <>
          A marketplace for <span className="text-grad-cyan">capability.</span>
        </>
      }
      sub="Skills, plugins, workflows, MCP servers and model presets. Every item declares its scopes; installation shows exactly what it asks for. Install is local: it lands in your registry, auditable and revocable."
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {items.map(([kind, name, v]) => (
          <div key={name} className="glass-2 glass-hover p-4">
            <div className="font-mono text-[10px] mb-2" style={{ color: 'var(--acc2)' }}>{kind}</div>
            <div className="font-medium text-sm">{name}</div>
            <div className="font-mono text-[10px] mt-1" style={{ color: 'var(--dim)' }}>{v}</div>
          </div>
        ))}
      </div>
    </LandingSection>
  );
}

/* ---------------- enterprise ---------------- */

export function EnterpriseSection() {
  const points = [
    ['SSO & SCIM', 'SAML, OIDC; user lifecycle sync'],
    ['On-prem & air-gapped', 'the whole stack runs in your VPC'],
    ['Audit export', 'SIEM-ready JSON / OTLP audit streams'],
    ['Data residency', 'Local & Hybrid modes pin data where you require'],
    ['Policy-as-code', 'risk matrix ships as config, versioned with your repo'],
    ['Support', 'ramkpraja175@gmail.com · +91 488407998'],
  ];
  return (
    <LandingSection
      id="enterprise"
      overline="enterprise"
      title={
        <>
          Enterprise-ready <span className="text-grad">without enterprise tax.</span>
        </>
      }
      sub="The same workspace that runs in a browser tab runs air-gapped in a datacenter. Controls scale up; the local-first core never changes."
    >
      <div className="grid md:grid-cols-3 gap-3">
        {points.map(([t, d]) => (
          <div key={t} className="glass-2 p-5">
            <div className="font-medium text-sm mb-1">{t}</div>
            <div className="text-xs" style={{ color: 'var(--dim)' }}>{d}</div>
          </div>
        ))}
      </div>
    </LandingSection>
  );
}

/* ---------------- privacy ---------------- */

export function PrivacySection() {
  return (
    <section className="relative py-24 px-6">
      <div className="mx-auto max-w-6xl">
        <div className="glass !rounded-[28px] p-8 md:p-12 relative overflow-hidden noise">
          <div className="overline mb-4">privacy</div>
          <h2 className="font-display text-3xl md:text-4xl font-semibold max-w-2xl">
            Local / Cloud / Hybrid. <span className="text-grad-cyan">Never silent.</span>
          </h2>
          <p className="mt-4 text-sm max-w-2xl" style={{ color: 'var(--dim)' }}>
            Local mode runs core chat, models, agents, RAG, memory, files, tasks, workflows, coding and testing fully offline.
            Sync is opt-in in five scopes. Private data is never uploaded without an explicit, revocable choice.
          </p>
          <div className="mt-8 grid md:grid-cols-3 gap-3">
            <div className="glass-2 p-5">
              <div className="font-mono text-[10px] tracking-widest mb-2" style={{ color: 'var(--acc2)' }}>MODES</div>
              <div className="flex flex-wrap gap-2">
                <span className="chip" style={{ color: 'var(--ok)' }}>local (default)</span>
                <span className="chip">hybrid</span>
                <span className="chip">cloud</span>
              </div>
            </div>
            <div className="glass-2 p-5">
              <div className="font-mono text-[10px] tracking-widest mb-2" style={{ color: 'var(--acc2)' }}>SYNC SCOPE</div>
              <div className="flex flex-wrap gap-2">
                {['none', 'metadata', 'selected projects', 'selected folders', 'workspace'].map((s) => (
                  <span key={s} className="chip">{s}</span>
                ))}
              </div>
            </div>
            <div className="glass-2 p-5">
              <div className="font-mono text-[10px] tracking-widest mb-2" style={{ color: 'var(--acc2)' }}>GUARANTEE</div>
              <div className="text-sm">Every outbound request is policy-checked and appears in Activity. If you can't see it leave, it doesn't leave.</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------------- final vision + footer ---------------- */

export function FinalSection() {
  return (
    <section className="relative py-32 px-6 overflow-hidden">
      <div
        className="absolute inset-0"
        style={{ background: 'radial-gradient(60% 50% at 50% 60%, color-mix(in srgb, var(--acc) 14%, transparent), transparent 70%)' }}
      />
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-100px' }}
        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 text-center max-w-4xl mx-auto"
      >
        <div className="overline mb-6">the final vision</div>
        <h2 className="font-display text-4xl md:text-6xl font-bold tracking-tight leading-[1.05]">
          ONE WORKSPACE.
          <br />
          <span className="text-grad">INFINITE POSSIBILITIES.</span>
        </h2>
        <p className="mt-6 text-sm md:text-base max-w-xl mx-auto" style={{ color: 'var(--dim)' }}>
          A cinematic, anime-inspired AI operating universe where models, agents, tools, knowledge, workflows, security and
          deployment become one connected system.
        </p>
        <div className="mt-10 flex flex-wrap justify-center gap-4">
          <Link href="/workspace" className="btn-primary">Enter the workspace <ArrowRight size={15} /></Link>
          <a href="https://github.com/rajaram-2005/Vishvakarma" target="_blank" rel="noreferrer" className="btn-ghost">
            View repository <ExternalLink size={13} />
          </a>
        </div>
      </motion.div>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="relative border-t px-6 py-12" style={{ borderColor: 'var(--line)' }}>
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-2.5">
          <svg width="20" height="20" viewBox="0 0 26 26">
            <polygon points="13,2 23,8 23,18 13,24 3,18 3,8" fill="none" stroke="var(--acc)" strokeWidth="1.6" />
            <circle cx="13" cy="13" r="3" fill="var(--acc2)" />
          </svg>
          <span className="font-mono text-xs tracking-[0.3em]" style={{ color: 'var(--dim)' }}>SUTRA · PROJECT 3</span>
        </div>
        <div className="text-xs text-center" style={{ color: 'var(--dim)' }}>
          local-first · provider-neutral · <span style={{ color: 'var(--ok)' }}>no data leaves without your say</span>
        </div>
        <div className="text-xs font-mono" style={{ color: 'var(--dim)' }}>
          contact: <a href="mailto:ramkpraja175@gmail.com" className="hover:underline" style={{ color: 'var(--acc2)' }}>ramkpraja175@gmail.com</a>
          {' · '}<a href="tel:+91488407998" className="hover:underline" style={{ color: 'var(--acc2)' }}>+91 488407998</a>
        </div>
      </div>
    </footer>
  );
}
