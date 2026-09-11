'use client';
// Aetherion landing — Hero · AI Core · Ecosystem · Models · Routing.

import React, { useMemo, useState } from 'react';
import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import Link from 'next/link';
import { ArrowRight, Play } from 'lucide-react';
import { UniverseCanvas } from '../canvas/Universe';
import { EcosystemGraph } from '../canvas/EcosystemGraph';
import { Pipeline, type Step } from '../ui';
import { DEFAULT_SETTINGS, SEED_MODELS } from '@/lib/seed';
import { route } from '@sutra/model-adapters';
import { reachableModels } from '@/lib/providers';

/* ---------------- section shell ---------------- */

export function LandingSection({
  id,
  overline,
  title,
  sub,
  children,
}: {
  id?: string;
  overline: string;
  title: React.ReactNode;
  sub?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const rm = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const y = useTransform(scrollYProgress, [0, 1], [46, -46]);
  return (
    <section id={id} className="relative py-24 md:py-32 px-6">
      <motion.div ref={ref} style={rm ? undefined : { y }} className="relative z-10 mx-auto max-w-6xl">
        <div className="overline mb-4">{overline}</div>
        <h2 className="font-display text-3xl md:text-5xl font-semibold leading-[1.08] tracking-tight max-w-3xl">{title}</h2>
        {sub && <p className="mt-5 text-sm md:text-base max-w-2xl leading-relaxed" style={{ color: 'var(--dim)' }}>{sub}</p>}
        {children && <div className="mt-12">{children}</div>}
      </motion.div>
    </section>
  );
}

/* ---------------- nav ---------------- */

export function LandingNav() {
  const [open, setOpen] = useState(false);
  const links = [
    ['Core', '#core'],
    ['Ecosystem', '#ecosystem'],
    ['Models', '#models'],
    ['Agents', '#agents'],
    ['Security', '#security'],
    ['Puter', '#puter'],
    ['Enterprise', '#enterprise'],
  ];
  return (
    <header className="fixed top-0 inset-x-0 z-50">
      <div className="glass mx-auto mt-4 max-w-5xl flex items-center justify-between px-5 py-3 !rounded-full">
        <Link href="/" className="flex items-center gap-2.5">
          <svg width="26" height="26" viewBox="0 0 26 26">
            <polygon points="13,2 23,8 23,18 13,24 3,18 3,8" fill="none" stroke="url(#navg)" strokeWidth="1.5" />
            <circle cx="13" cy="13" r="3.4" fill="url(#navg)" />
            <defs>
              <linearGradient id="navg" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#8b5cf6" />
                <stop offset="1" stopColor="#22d3ee" />
              </linearGradient>
            </defs>
          </svg>
          <span className="font-display font-semibold tracking-[0.3em] text-sm">Aetherion</span>
        </Link>
        <nav className="hidden md:flex items-center gap-6">
          {links.map(([l, h]) => (
            <a key={h} href={h} className="text-xs font-mono tracking-wider transition-opacity hover:opacity-100" style={{ color: 'var(--dim)' }}>
              {l}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <Link href="/workspace" className="btn-primary !py-2 !px-4 text-xs">
            Launch Workspace <ArrowRight size={13} />
          </Link>
          <button className="md:hidden text-xl px-1" onClick={() => setOpen(!open)} style={{ color: 'var(--ink)' }} aria-label="menu">
            {open ? '×' : '☰'}
          </button>
        </div>
      </div>
      {open && (
        <div className="glass mx-4 mt-2 md:hidden p-4 flex flex-col gap-3">
          {links.map(([l, h]) => (
            <a key={h} href={h} onClick={() => setOpen(false)} className="text-sm font-mono" style={{ color: 'var(--dim)' }}>
              {l}
            </a>
          ))}
        </div>
      )}
    </header>
  );
}

/* ---------------- hero ---------------- */

export function Hero() {
  const rm = useReducedMotion();
  const { scrollY } = useScroll();
  const yBg = useTransform(scrollY, [0, 800], [0, 140]);
  const chips = [
    ['12 models', '8 runtimes'],
    ['7 agents', '4 teams'],
    ['11 tools', '5 mcp servers'],
    ['rag', 'cited answers'],
  ];
  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden">
      <motion.div style={rm ? undefined : { y: yBg }} className="absolute inset-0 -z-0">
        <UniverseCanvas mode="hero" />
      </motion.div>
      <div className="absolute inset-0 -z-0 pointer-events-none" style={{ background: 'radial-gradient(70% 55% at 50% 45%, transparent 40%, var(--bg) 100%)' }} />

      <div className="relative z-10 max-w-5xl mx-auto px-6 text-center pt-24 pb-16">
        <motion.div
          initial={{ opacity: 0, y: rm ? 0 : 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.2 }}
          className="overline mb-6"
        >
          project 3 · the open ai ecosystem
        </motion.div>
        <motion.h1
          initial={{ opacity: 0, y: rm ? 0 : 26 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="font-display text-5xl md:text-7xl font-bold tracking-tight leading-[1.02]"
        >
          BUILD THE
          <br />
          <span className="text-grad">OPEN AI ECOSYSTEM.</span>
        </motion.h1>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 0.7 }}
          className="mt-7 text-base md:text-lg max-w-2xl mx-auto leading-relaxed"
          style={{ color: 'var(--dim)' }}
        >
          Models. Agents. Tools. Knowledge. Workflows. Local AI.
          <br className="hidden md:block" />
          One workspace to build, automate, evaluate, and deploy AI systems.
        </motion.p>
        <motion.div
          initial={{ opacity: 0, y: rm ? 0 : 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.95 }}
          className="mt-10 flex flex-wrap items-center justify-center gap-4"
        >
          <Link href="/workspace" className="btn-primary">
            Launch Workspace <ArrowRight size={15} />
          </Link>
          <a href="#core" className="btn-ghost">
            <Play size={14} /> Explore the Core
          </a>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 1.25 }}
          className="mt-16 flex flex-wrap justify-center gap-3"
        >
          {chips.map(([a, b], i) => (
            <motion.div
              key={a}
              className="glass-2 px-4 py-2 font-mono text-[11px] tracking-wider"
              style={{ color: 'var(--dim)' }}
              animate={rm ? undefined : { y: [0, i % 2 ? -7 : 7, 0] }}
              transition={{ duration: 5 + i, repeat: Infinity, ease: 'easeInOut' }}
            >
              <span style={{ color: 'var(--acc2)' }}>{a}</span>
              <span className="mx-2 opacity-40">·</span>
              {b}
            </motion.div>
          ))}
        </motion.div>
      </div>

      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10" style={{ color: 'var(--dim)' }}>
        <div className="font-mono text-[10px] tracking-[0.3em] animate-pulse-soft">SCROLL TO DESCEND</div>
      </div>
    </div>
  );
}

/* ---------------- AI core ---------------- */

export function CoreSection() {
  return (
    <LandingSection
      id="core"
      overline="the ai core"
      title={
        <>
          One energy source: <span className="text-grad-cyan">your data, your runtime, your intent.</span>
        </>
      }
      sub="Aetherion fuses a local-first AI workspace with the embedded Aetheris intelligence core. Every model, agent, tool and workflow ties together in one place — and it runs on your machine first. Nothing here requires a cloud account."
    >
      <div className="glass relative overflow-hidden !rounded-[28px]">
        <div className="absolute inset-0">
          <UniverseCanvas mode="core" intensity={0.9} parallax={false} />
        </div>
        <div className="relative z-10 grid md:grid-cols-3 gap-4 p-6 md:p-8 min-h-[420px] items-center pointer-events-none">
          <div className="glass-2 p-5 max-w-[240px] md:mr-auto self-start">
            <div className="font-mono text-[10px] tracking-widest mb-2" style={{ color: 'var(--acc2)' }}>CORE/STATUS</div>
            <div className="text-sm font-medium">online · local</div>
            <div className="text-xs mt-2" style={{ color: 'var(--dim)' }}>Aetherion Local always available. Connect Ollama or an API and the core routes automatically.</div>
          </div>
          <div />
          <div className="glass-2 p-5 max-w-[240px] self-end">
            <div className="font-mono text-[10px] tracking-widest mb-2" style={{ color: 'var(--acc2)' }}>CORE/ENERGY</div>
            <div className="text-sm font-medium">request → route → result</div>
            <div className="text-xs mt-2" style={{ color: 'var(--dim)' }}>Every request is analyzed, ranked and traced. You always see why a model was chosen.</div>
          </div>
        </div>
      </div>
    </LandingSection>
  );
}

/* ---------------- ecosystem ---------------- */

export function EcosystemSection() {
  const anchors: Record<string, string> = {
    models: '#models',
    agents: '#agents',
    skills: '#skills',
    memory: '#memory',
    rag: '#rag',
    tools: '#tools',
    mcp: '#mcp',
    github: '#github',
    n8n: '#n8n',
    security: '#security',
    evaluation: '#evaluation',
    deployment: '#deployment',
    marketplace: '#marketplace',
    hf: '#models',
  };
  return (
    <LandingSection
      id="ecosystem"
      overline="the ecosystem"
      title={
        <>
          One network. <span className="text-grad">Fourteen orbits.</span>
        </>
      }
      sub="GitHub, Hugging Face, MCP, n8n, models, agents, skills, memory, RAG, tools, security, evaluation, deployment and marketplace — all energized by the same core. Hover a node. Click to jump to its chapter."
    >
      <div className="glass !rounded-[28px] p-4 md:p-8 overflow-hidden">
        <EcosystemGraph
          onNodeClick={(id) => {
            const h = anchors[id];
            if (h) document.querySelector(h)?.scrollIntoView({ behavior: 'smooth' });
          }}
        />
      </div>
    </LandingSection>
  );
}

/* ---------------- models ---------------- */

const RUNTIMES = [
  ['Ollama', 'ollama'],
  ['llama.cpp', 'llama.cpp'],
  ['vLLM', 'vllm'],
  ['SGLang', 'sglang'],
  ['Transformers', 'transformers'],
  ['MLX', 'mlx'],
  ['ONNX Runtime', 'onnx'],
  ['TensorRT-LLM', 'trtllm'],
];

export function ModelsSection() {
  return (
    <LandingSection
      id="models"
      overline="models"
      title={
        <>
          Runtime-neutral. <span className="text-grad-cyan">Vendor-transparent.</span>
        </>
      }
      sub="Eight local runtimes and every major API surface, behind one adapter interface. Models are interchangeable; routing is visible; nothing is locked."
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-10">
        {RUNTIMES.map(([name, tech], i) => (
          <div key={name} className="glass-2 glass-hover p-4">
            <div className="font-mono text-[10px] tracking-widest mb-2" style={{ color: i % 2 ? 'var(--acc2)' : 'var(--acc)' }}>
              RUNTIME {String(i + 1).padStart(2, '0')}
            </div>
            <div className="font-medium">{name}</div>
            <div className="text-[11px] font-mono mt-1" style={{ color: 'var(--dim)' }}>
              adapter · {tech}
            </div>
          </div>
        ))}
      </div>
      <div className="glass-2 overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead>
            <tr className="font-mono text-[10px] tracking-widest" style={{ color: 'var(--dim)' }}>
              <th className="text-left px-5 py-3">MODEL</th>
              <th className="text-left px-5 py-3">RUNTIME</th>
              <th className="text-left px-5 py-3">CONTEXT</th>
              <th className="text-left px-5 py-3">CAPABILITIES</th>
              <th className="text-left px-5 py-3">COST / 1K</th>
            </tr>
          </thead>
          <tbody>
            {SEED_MODELS.slice(1, 9).map((m) => (
              <tr key={m.id} className="border-t" style={{ borderColor: 'var(--line)' }}>
                <td className="px-5 py-2.5 font-medium">{m.name}</td>
                <td className="px-5 py-2.5 font-mono text-xs" style={{ color: 'var(--acc2)' }}>{m.runtime}</td>
                <td className="px-5 py-2.5 font-mono text-xs" style={{ color: 'var(--dim)' }}>{Math.round(m.contextWindow / 1000)}k</td>
                <td className="px-5 py-2.5 text-xs" style={{ color: 'var(--dim)' }}>{m.capabilities.join(' · ')}</td>
                <td className="px-5 py-2.5 font-mono text-xs">{m.costIn === 0 ? 'local' : `$${m.costIn} / $${m.costOut}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </LandingSection>
  );
}

/* ---------------- routing ---------------- */

const ROUTE_STEPS: Step[] = [
  { id: 'r1', label: 'Request', desc: 'natural language in' },
  { id: 'r2', label: 'Task Analysis', desc: 'intents detected' },
  { id: 'r3', label: 'Model Ranking', desc: 'scored & reasoned' },
  { id: 'r4', label: 'Model', desc: 'best fit executed' },
  { id: 'r5', label: 'Result', desc: 'traced end-to-end' },
];

const SAMPLE_PROMPTS = [
  'Write a TypeScript function that debounces an event handler',
  'What is 17 × 23 + 5?',
  'Summarize the Aetherion design principles document',
  'Draft a poetic product tagline for an AI workspace',
];

export function RoutingSection() {
  const [prompt, setPrompt] = useState(SAMPLE_PROMPTS[0]);
  const [result, setResult] = useState<ReturnType<typeof route> | null>(null);

  const run = () => {
    const pool = reachableModels(SEED_MODELS, DEFAULT_SETTINGS);
    setResult(route(pool, prompt || 'hello', { requireLocal: true }));
  };

  return (
    <LandingSection
      overline="routing"
      title={
        <>
          Every request is <span className="text-grad">analyzed, ranked and reasoned.</span>
        </>
      }
      sub="The model router reads the task, scores every reachable model against capabilities, latency, context and cost — then shows you exactly why it chose what it chose. Try it with a real prompt:"
    >
      <Pipeline steps={ROUTE_STEPS} />
      <div className="mt-8 glass p-5 md:p-6">
        <div className="flex flex-col md:flex-row gap-3">
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && run()}
            className="glass-2 flex-1 px-4 py-3 text-sm outline-none"
            style={{ color: 'var(--ink)' }}
            placeholder="type a task…"
          />
          <button onClick={run} className="btn-primary self-start">
            Route it
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {SAMPLE_PROMPTS.map((s) => (
            <button key={s} onClick={() => setPrompt(s)} className="chip hover:opacity-100" style={{ opacity: 0.7 }}>
              {s.slice(0, 44)}…
            </button>
          ))}
        </div>
        {result && (
          <div className="mt-6 grid md:grid-cols-2 gap-4">
            <div className="glass-2 p-4">
              <div className="font-mono text-[10px] tracking-widest mb-3" style={{ color: 'var(--acc2)' }}>TASK ANALYSIS</div>
              <div className="text-sm">{result.analysis.label}</div>
              <div className="mt-4 font-mono text-[10px] tracking-widest mb-2" style={{ color: 'var(--acc2)' }}>
                CHSEN
              </div>
              <div className="text-sm font-medium">
                {result.chosen?.name} <span className="font-mono text-xs" style={{ color: 'var(--dim)' }}>· {result.chosen?.runtime}</span>
              </div>
            </div>
            <div className="glass-2 p-4">
              <div className="font-mono text-[10px] tracking-widest mb-3" style={{ color: 'var(--acc2)' }}>MODEL RANKING</div>
              <div className="space-y-2">
                {result.ranking.slice(0, 4).map((r, i) => {
                  const m = SEED_MODELS.find((x) => x.id === r.modelId);
                  return (
                    <div key={r.modelId} className="flex items-center gap-3">
                      <span className="font-mono text-[10px] w-4" style={{ color: 'var(--dim)' }}>{i + 1}</span>
                      <span className="text-xs w-36 truncate">{m?.name ?? r.modelId}</span>
                      <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: 'var(--panel-2)' }}>
                        <div className="h-full" style={{ width: `${Math.min(100, r.score)}%`, background: 'linear-gradient(90deg, var(--acc), var(--acc2))' }} />
                      </div>
                      <span className="font-mono text-[10px] w-8 text-right" style={{ color: 'var(--dim)' }}>{r.score}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </LandingSection>
  );
}
