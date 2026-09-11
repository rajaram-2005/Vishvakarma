// Aetherion — workspace seed data. Everything the app ships with, offline.

import type {
  ActivityEvent,
  AgentDef,
  Approval,
  Chunk,
  Conversation,
  Deployment,
  GitState,
  KnowledgeDoc,
  McpServer,
  MemoryEntry,
  ModelInfo,
  Project,
  Settings,
  SkillDef,
  SutraTask,
  TeamDef,
  ToolDef,
  Trace,
  Workflow,
} from '@sutra/shared';
import { BUILTIN_TOOLS } from '@sutra/tool-adapters';
import { chunkText } from '@sutra/shared';

export const SEED_VERSION = 3;

export interface AppStateSeed {
  version: number;
  settings: Settings;
  models: ModelInfo[];
  projects: Project[];
  conversations: Conversation[];
  agents: AgentDef[];
  teams: TeamDef[];
  skills: SkillDef[];
  tools: ToolDef[];
  workflows: Workflow[];
  mcp: McpServer[];
  memory: MemoryEntry[];
  knowledge: KnowledgeDoc[];
  chunks: Chunk[];
  tasksByProject: Record<string, SutraTask[]>;
  traces: Trace[];
  approvals: Approval[];
  sessionAllowed: string[];
  deployments: Deployment[];
  activity: ActivityEvent[];
  installed: string[];
  fs: Record<string, string>;
  git: GitState;
  evalReports: EvalReportSummary[];
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'dark',
  reducedMotion: 'system',
  ambientSound: false,
  ambientVolume: 0.5,
  privacyMode: 'local',
  syncScope: 'none',
  providers: {
    ollamaUrl: 'http://localhost:11434',
    openaiBaseUrl: '',
    openaiApiKey: '',
    openaiModel: '',
    otlpEndpoint: '',
  },
  server: { baseUrl: '' },
  // Empty = the intelligence core is embedded in this app (same origin,
  // /api/*). Set an explicit http(s) URL only to target an external
  // Aetheris One instance.
  aetheris: { baseUrl: '' },
};

// Fixed anchor for every seed timestamp. The seed must be byte-identical on the
// server and client render passes — wall-clock values (`Date.now()`) change in
// the gap between SSR and hydration and break React hydration.
export const SEED_NOW_MS = Date.parse('2026-09-01T09:00:00.000Z');

const now = () => new Date(SEED_NOW_MS).toISOString();

export const SEED_MODELS: ModelInfo[] = [
  {
    id: 'sutra-local',
    name: 'Aetherion Local',
    provider: 'Aetherion built-in',
    runtime: 'sutra-local',
    contextWindow: 128000,
    costIn: 0,
    costOut: 0,
    latencyTier: 'low',
    capabilities: ['structured', 'code', 'creative', 'math'],
    available: true,
    local: true,
  },
  {
    id: 'llama3.1-8b',
    name: 'Llama 3.1 8B',
    provider: 'Meta',
    runtime: 'ollama',
    contextWindow: 131000,
    costIn: 0,
    costOut: 0,
    latencyTier: 'medium',
    capabilities: ['code', 'structured', 'creative'],
    available: true,
    local: true,
  },
  {
    id: 'mistral-7b',
    name: 'Mistral 7B',
    provider: 'Mistral AI',
    runtime: 'ollama',
    contextWindow: 32000,
    costIn: 0,
    costOut: 0,
    latencyTier: 'low',
    capabilities: ['structured', 'creative'],
    available: true,
    local: true,
  },
  {
    id: 'gemma2-9b',
    name: 'Gemma 2 9B',
    provider: 'Google',
    runtime: 'llamacpp',
    contextWindow: 8000,
    costIn: 0,
    costOut: 0,
    latencyTier: 'low',
    capabilities: ['structured'],
    available: true,
    local: true,
  },
  {
    id: 'mini-cpm-v',
    name: 'MiniCPM-V',
    provider: 'OpenBMB',
    runtime: 'mlx',
    contextWindow: 8000,
    costIn: 0,
    costOut: 0,
    latencyTier: 'low',
    capabilities: ['vision', 'creative'],
    available: true,
    local: true,
  },
  {
    id: 'qwen2.5-coder-14b',
    name: 'Qwen 2.5 Coder 14B',
    provider: 'Qwen',
    runtime: 'vllm',
    contextWindow: 32000,
    costIn: 0,
    costOut: 0,
    latencyTier: 'medium',
    capabilities: ['code'],
    available: true,
    local: true,
  },
  {
    id: 'deepseek-coder-v2',
    name: 'DeepSeek Coder V2',
    provider: 'DeepSeek',
    runtime: 'vllm',
    contextWindow: 128000,
    costIn: 0,
    costOut: 0,
    latencyTier: 'medium',
    capabilities: ['code', 'long-context'],
    available: true,
    local: true,
  },
  {
    id: 'phi-4-mini',
    name: 'Phi-4 Mini',
    provider: 'Microsoft',
    runtime: 'transformers',
    contextWindow: 128000,
    costIn: 0.004,
    costOut: 0.016,
    latencyTier: 'medium',
    capabilities: ['math', 'structured', 'code'],
    available: true,
    local: false,
  },
  {
    id: 'nemotron-70b',
    name: 'Nemotron 70B',
    provider: 'NVIDIA',
    runtime: 'sglang',
    contextWindow: 128000,
    costIn: 0.05,
    costOut: 0.17,
    latencyTier: 'high',
    capabilities: ['long-context', 'structured'],
    available: true,
    local: false,
  },
  {
    id: 'llama4-70b',
    name: 'Llama 4 70B',
    provider: 'Meta',
    runtime: 'trtllm',
    contextWindow: 512000,
    costIn: 0.08,
    costOut: 0.24,
    latencyTier: 'high',
    capabilities: ['long-context', 'code'],
    available: true,
    local: false,
  },
  {
    id: 'gpt-4o-mini',
    name: 'GPT-4o mini',
    provider: 'OpenAI',
    runtime: 'openai-compat',
    contextWindow: 128000,
    costIn: 0.15,
    costOut: 0.6,
    latencyTier: 'low',
    capabilities: ['code', 'creative', 'structured', 'math', 'vision'],
    available: true,
    local: false,
  },
  {
    id: 'qwen2.5-72b',
    name: 'Qwen 2.5 72B',
    provider: 'Qwen (API)',
    runtime: 'openai-compat',
    contextWindow: 128000,
    costIn: 0.3,
    costOut: 1.5,
    latencyTier: 'medium',
    capabilities: ['code', 'math', 'long-context'],
    available: true,
    local: false,
  },
];

export const SEED_AGENTS: AgentDef[] = [
  {
    id: 'ag-architect',
    name: 'Architect',
    role: 'System Architect',
    model: 'llama3.1-8b',
    tools: ['fs.read', 'fs.write', 'api.fetch'],
    skills: ['rag-tuning'],
    permissions: ['fs.read', 'fs.write'],
    system: 'You design systems. Prefer boring technology, explicit interfaces and local-first data.',
    color: '#8b5cf6',
  },
  {
    id: 'ag-coder',
    name: 'Coder',
    role: 'Implementation Engineer',
    model: 'deepseek-coder-v2',
    tools: ['fs.read', 'fs.write', 'terminal.exec', 'code.exec'],
    skills: ['code-review', 'unit-testing'],
    permissions: ['fs.read', 'fs.write', 'terminal'],
    system: 'You write small, tested, typed code. Never push without review.',
    color: '#22d3ee',
  },
  {
    id: 'ag-researcher',
    name: 'Researcher',
    role: 'Knowledge Scout',
    model: 'mistral-7b',
    tools: ['api.fetch', 'browser.nav', 'docs.read'],
    skills: ['data-pipeline'],
    permissions: ['network', 'fs.read'],
    system: 'You find sources, verify claims and ground answers with citations.',
    color: '#60a5fa',
  },
  {
    id: 'ag-tester',
    name: 'Tester',
    role: 'Quality Guardian',
    model: 'sutra-local',
    tools: ['terminal.exec', 'code.exec'],
    skills: ['unit-testing'],
    permissions: ['terminal'],
    system: 'You write and run tests. Red is information, not failure.',
    color: '#34d399',
  },
  {
    id: 'ag-security',
    name: 'Sentinel',
    role: 'Security Auditor',
    model: 'sutra-local',
    tools: ['fs.read', 'db.query'],
    skills: ['incident-response'],
    permissions: ['fs.read'],
    system: 'You hunt secrets, risky calls and permission leaks. You escalate, never hide.',
    color: '#f87171',
  },
  {
    id: 'ag-writer',
    name: 'Scribe',
    role: 'Documentation Writer',
    model: 'phi-4-mini',
    tools: ['fs.read', 'fs.write'],
    skills: ['prompt-craft'],
    permissions: ['fs.read', 'fs.write'],
    system: 'You turn messy ideas into crisp docs: READMEs, ADRs, release notes.',
    color: '#e879f9',
  },
  {
    id: 'ag-ops',
    name: 'Ops',
    role: 'Deployment Engineer',
    model: 'nemotron-70b',
    tools: ['deploy.run', 'terminal.exec', 'db.query'],
    skills: ['deploy-checklist'],
    permissions: ['deploy', 'terminal'],
    system: 'You ship: build, scan, deploy, verify, roll back if needed.',
    color: '#fbbf24',
  },
];

export const SEED_TEAMS: TeamDef[] = [
  {
    id: 'tm-mvp',
    name: 'MVP Squad',
    goal: 'Take a product goal from idea to deployed, tested, secure MVP.',
    orchestrator: 'ag-architect',
    members: ['ag-architect', 'ag-coder', 'ag-tester', 'ag-security'],
    createdAt: now(),
  },
  {
    id: 'tm-research',
    name: 'Research Cell',
    goal: 'Investigate a question against knowledge sources and produce a cited brief.',
    orchestrator: 'ag-researcher',
    members: ['ag-researcher', 'ag-writer'],
    createdAt: now(),
  },
];

export const SEED_SKILLS: SkillDef[] = [
  {
    id: 'sk-code-review',
    name: 'Code Review',
    kind: 'skill',
    description: 'HOW to review: diff-first, risk-prioritized, style second. Produces findings with severity.',
    version: '1.2.0',
    license: 'MIT',
    author: 'Aetherion',
    scopes: ['fs.read'],
    installed: true,
    builtin: true,
  },
  {
    id: 'sk-unit-testing',
    name: 'Unit Testing',
    kind: 'skill',
    description: 'HOW to test: property lists → cases → red/green loop with real assertions.',
    version: '1.0.3',
    license: 'MIT',
    author: 'Aetherion',
    scopes: ['terminal'],
    installed: true,
    builtin: true,
  },
  {
    id: 'sk-git-flow',
    name: 'Git Flow',
    kind: 'skill',
    description: 'HOW to branch: trunk-based with short-lived feature branches and atomic commits.',
    version: '1.1.0',
    license: 'MIT',
    author: 'Aetherion',
    scopes: ['git'],
    installed: true,
    builtin: true,
  },
  {
    id: 'sk-prompt-craft',
    name: 'Prompt Craft',
    kind: 'skill',
    description: 'HOW to prompt: role, context, format, examples, constraints — in that order.',
    version: '1.0.0',
    license: 'MIT',
    author: 'Aetherion',
    scopes: [],
    installed: true,
    builtin: true,
  },
  {
    id: 'sk-incident-response',
    name: 'Incident Response',
    kind: 'skill',
    description: 'HOW to respond: detect, contain, communicate, fix, post-mortem without blame.',
    version: '1.0.1',
    license: 'MIT',
    author: 'Aetherion',
    scopes: ['terminal', 'db'],
    installed: true,
    builtin: true,
  },
  {
    id: 'sk-data-pipeline',
    name: 'Data Pipeline',
    kind: 'skill',
    description: 'HOW to pipe: source → normalize → validate → store, with idempotent steps.',
    version: '0.9.2',
    license: 'MIT',
    author: 'Aetherion',
    scopes: ['db', 'network'],
    installed: false,
    builtin: true,
  },
  {
    id: 'sk-rag-tuning',
    name: 'RAG Tuning',
    kind: 'skill',
    description: 'HOW to tune retrieval: chunk sizes, overlap, rerank blends, citation formats.',
    version: '1.0.0',
    license: 'MIT',
    author: 'Aetherion',
    scopes: ['fs.read'],
    installed: false,
    builtin: true,
  },
  {
    id: 'sk-deploy-checklist',
    name: 'Deploy Checklist',
    kind: 'skill',
    description: 'HOW to ship: env check, secrets scan, canary, health probes, rollback plan.',
    version: '1.1.1',
    license: 'MIT',
    author: 'Aetherion',
    scopes: ['deploy'],
    installed: true,
    builtin: true,
  },
];

export const SEED_MCP: McpServer[] = [
  {
    id: 'mcp-fs',
    name: 'Filesystem (local adapter)',
    transport: 'stdio',
    command: 'sutra-mcp fs',
    version: '0.4.1',
    status: 'healthy',
    tools: [
      { name: 'read_file', description: 'Read a file from the workspace' },
      { name: 'write_file', description: 'Write a file inside the workspace' },
      { name: 'list_dir', description: 'List a directory' },
    ],
    scopes: ['fs.read', 'fs.write'],
    installed: true,
  },
  {
    id: 'mcp-fetch',
    name: 'Fetch (local adapter)',
    transport: 'stdio',
    command: 'sutra-mcp fetch',
    version: '0.3.0',
    status: 'healthy',
    tools: [
      { name: 'fetch_url', description: 'Fetch a URL and extract readable text' },
      { name: 'search_web', description: 'Web search via the configured provider' },
    ],
    scopes: ['network'],
    installed: true,
  },
  {
    id: 'mcp-github',
    name: 'GitHub',
    transport: 'http',
    url: 'https://api.githubcopilot.com/mcp/',
    version: '1.0.0',
    status: 'unknown',
    tools: [
      { name: 'get_repository', description: 'Repository metadata and files' },
      { name: 'list_issues', description: 'Open issues with labels' },
      { name: 'create_pull_request', description: 'Open a PR from a branch' },
    ],
    scopes: ['git', 'network'],
    installed: false,
  },
  {
    id: 'mcp-puppeteer',
    name: 'Puppeteer',
    transport: 'stdio',
    command: 'npx @modelcontextprotocol/server-puppeteer',
    version: '2.1.0',
    status: 'offline',
    tools: [
      { name: 'navigate', description: 'Open a page in a headless browser' },
      { name: 'click', description: 'Click a selector' },
      { name: 'screenshot', description: 'Capture a screenshot' },
    ],
    scopes: ['browser'],
    installed: false,
  },
  {
    id: 'mcp-sentry',
    name: 'Sentry',
    transport: 'http',
    url: 'https://mcp.sentry.dev/mcp',
    version: '1.4.0',
    status: 'offline',
    tools: [
      { name: 'get_issue', description: 'Fetch an issue with events' },
      { name: 'list_releases', description: 'Recent releases' },
    ],
    scopes: ['network'],
    installed: false,
  },
];

export const SAMPLE_DOC_TEXT = `# Aetherion Design Principles

Aetherion is a local-first AI operating workspace fused with the embedded Aetheris intelligence core — one shared field where your models, agents, tools, knowledge and workflows connect into a single system.

## Principle 1 — Local by default

Every core capability — chat, planning, tasks, memory, RAG, coding, testing — must work with zero network. Cloud services are optional accelerators, never dependencies. Data leaves the machine only when the user explicitly enables a sync scope.

## Principle 2 — Provider neutrality

Models are interchangeable behind an adapter interface. Ollama, llama.cpp, vLLM, SGLang, Transformers, MLX, ONNX Runtime and TensorRT-LLM are first-class runtimes. No vendor lock-in, no silent fallbacks: routing decisions are always visible.

## Principle 3 — Nothing dangerous is silent

Every tool call passes the gateway: Agent → Tool Gateway → Policy → Sandbox → Execution. Risk is classified (low, medium, high, critical), every classification carries reasons, and anything above low risk can be intercepted by a human approval: Allow Once, Allow Session, or Inspect.

## Principle 4 — Measure everything

Accuracy, factuality, hallucination, completion, latency, tokens, memory, tool success, security, cost and reproducibility. Traces follow the shape of OpenTelemetry spans so the whole system plugs into existing observability stacks.

## Principle 5 — Skills are HOW, memory is WHAT

A skill teaches an agent a method. Memory stores what the system knows about you and the project. Retrieval-augmented generation grounds generation in your documents with citations.

## Operating modes

Local mode keeps everything on-device. Hybrid mode allows selected cloud calls with a per-request policy. Cloud mode is fully remote and is never the default. Sync is opt-in: none, metadata, selected projects, selected folders, or full workspace.

## The stack

React, Next.js, TypeScript and Tailwind for the web surface; Tauri for desktop; React Native for mobile; Python FastAPI for services; PostgreSQL, Redis and a vector store for persistence; Prometheus and Grafana for metrics; OpenTelemetry for traces.`;

export const SEED_FS: Record<string, string> = {
  'README.md': `# Project 3 — Aetherion MVP

Local-first AI operating workspace.

\`\`\`bash
npm run dev
\`\`\`

See docs/ for architecture.`,
  'package.json': `{
  "name": "aetherion-mvp",
  "version": "0.1.0",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "test": "vitest run"
  }
}`,
  'tsconfig.json': `{
  "compilerOptions": {
    "strict": true,
    "moduleResolution": "Bundler"
  }
}`,
  'src/app.tsx': `import { AetherionCore } from './core';

export default function App() {
  const core = new AetherionCore({ mode: 'local' });
  core.connect();
  return (
    <main className="sutra">
      <h1>Aetherion</h1>
      <p>{core.status}</p>
    </main>
  );
}`,
  'src/core.ts': `export interface AetherionOptions {
  mode: 'local' | 'hybrid' | 'cloud';
}

export class AetherionCore {
  status = 'idle';
  constructor(private opts: AetherionOptions) {}

  connect(): void {
    this.status = this.opts.mode === 'local' ? 'online (local)' : 'online (' + this.opts.mode + ')';
  }

  async ask(question: string): Promise<string> {
    if (!question.trim()) throw new Error('empty question');
    return 'routing: ' + question.slice(0, 40);
  }
}`,
  'src/router.ts': `export type TaskKind = 'code' | 'math' | 'long' | 'general';

export function classify(text: string): TaskKind {
  if (/\\d+\\s*[\\+\\-\\*\\/\\^]/.test(text)) return 'math';
  if (text.length > 6000) return 'long';
  if (/function|class|import/.test(text)) return 'code';
  return 'general';
}
`,
  'tests/app.test.ts': `import { describe, it, expect } from 'vitest';
import { AetherionCore } from '../src/core';
import { classify } from '../src/router';

describe('Aetherion core', () => {
  it('connects in local mode', () => {
    const core = new AetherionCore({ mode: 'local' });
    core.connect();
    expect(core.status).toContain('local');
  });

  it('classifies math tasks', () => {
    expect(classify('what is 2+2?')).toBe('math');
  });
});
`,
  '.aetherion/config.json': `{
  "version": 1,
  "privacy": { "mode": "local", "sync": "none" },
  "security": { "autoApproveBelow": "low" }
}`,
};

export const SEED_GIT: GitState = {
  branch: 'main',
  log: [
    {
      hash: 'a1f0c9d',
      message: 'init: Aetherion MVP scaffold',
      files: Object.keys(SEED_FS),
      ts: new Date(SEED_NOW_MS - 3600e3).toISOString(),
      branch: 'main',
    },
  ],
  lastFs: { ...SEED_FS },
  remote: false,
};

export const SEED_KNOWLEDGE: KnowledgeDoc[] = [
  {
    id: 'doc-design',
    title: 'Aetherion Design Principles',
    source: 'bundled document',
    kind: 'text',
    createdAt: new Date(SEED_NOW_MS - 7200e3).toISOString(),
    chars: SAMPLE_DOC_TEXT.length,
    chunkCount: 0,
  },
];

export const seedState = (): AppStateSeed => {
  const chunks = chunkText(SAMPLE_DOC_TEXT, 'doc-design');
  const state: AppStateSeed = {
    version: SEED_VERSION,
    settings: { ...DEFAULT_SETTINGS },
    models: SEED_MODELS.map((m) => ({ ...m })),
    projects: [
      {
        id: 'prj-3',
        name: 'Project 3 — Aetherion MVP',
        description: 'The open AI ecosystem: models, agents, tools, knowledge, workflows — one workspace.',
        template: 'mvp',
        color: '#8b5cf6',
        createdAt: now(),
      },
    ],
    conversations: [
      {
        id: 'conv-welcome',
        title: 'Welcome to Aetherion',
        createdAt: now(),
        messages: [
          {
            id: 'm-welcome',
            role: 'assistant',
            content:
              'Welcome to Aetherion — your AI operating workspace. Everything here runs locally first.\n\nTry:\n• "Plan my Project 3 MVP." — I\'ll structure it into tasks\n• "What are Aetherion\'s design principles?" — answered from your Knowledge base with citations\n• "What is 17 × 23 + 5?" — computed on-device\n\nConnect Ollama in Settings → Providers and real local models join the router.',
            ts: now(),
            model: 'sutra-local',
          },
        ],
      },
    ],
    agents: SEED_AGENTS.map((a) => ({ ...a })),
    teams: SEED_TEAMS.map((t) => ({ ...t })),
    skills: SEED_SKILLS.map((s) => ({ ...s })),
    tools: BUILTIN_TOOLS.map((t) => ({ ...t })),
    workflows: [
      {
        id: 'wf-nightly',
        name: 'Nightly Evaluation',
        description: 'Runs the smoke benchmark against the best local model and logs the report.',
        trigger: 'schedule',
        schedule: '0 2 * * *',
        nodes: [
          { id: 'n1', type: 'trigger', label: 'Schedule 02:00', config: {} },
          { id: 'n2', type: 'ai', label: 'Run smoke suite', config: { prompt: 'Run the smoke evaluation suite and report JSON' } },
          { id: 'n3', type: 'setVar', label: 'Store report', config: { name: 'report', value: '$output' } },
          { id: 'n4', type: 'notify', label: 'Activity ping', config: { message: 'Nightly eval complete' } },
        ],
        edges: [
          ['n1', 'n2'],
          ['n2', 'n3'],
          ['n3', 'n4'],
        ],
        updatedAt: now(),
      },
      {
        id: 'wf-pr',
        name: 'PR Security Review',
        description: 'When a PR opens: fetch it, run Sentinel, and wait for human approval before merge advice.',
        trigger: 'event',
        nodes: [
          { id: 'p1', type: 'trigger', label: 'PR opened', config: {} },
          { id: 'p2', type: 'http', label: 'Fetch PR diff', config: { method: 'GET', url: 'https://api.github.com/repos/{owner}/{repo}/pulls/{n}' } },
          { id: 'p3', type: 'ai', label: 'Sentinel review', config: { prompt: 'Review this diff for secrets and risky changes: $diff' } },
          { id: 'p4', type: 'approval', label: 'Human gate', config: {} },
          { id: 'p5', type: 'notify', label: 'Post verdict', config: { message: 'Security review verdict' } },
        ],
        edges: [
          ['p1', 'p2'],
          ['p2', 'p3'],
          ['p3', 'p4'],
          ['p4', 'p5'],
        ],
        updatedAt: now(),
      },
    ] as Workflow[],
    mcp: SEED_MCP.map((m) => ({ ...m })),
    memory: [
      { id: 'mem-1', kind: 'fact', text: 'Project 3 is codenamed Aetherion — the open AI ecosystem workspace.', source: 'system', ts: now() },
      { id: 'mem-2', kind: 'preference', text: 'Local-first: no data leaves the machine without an explicit opt-in.', source: 'system', ts: now() },
    ] as MemoryEntry[],
    knowledge: SEED_KNOWLEDGE.map((d) => ({ ...d, chunkCount: chunks.length })),
    chunks,
    tasksByProject: { 'prj-3': [] } as Record<string, SutraTask[]>,
    traces: [],
    approvals: [] as Approval[],
    sessionAllowed: [] as string[],
    deployments: [] as Deployment[],
    activity: [
      {
        id: 'act-1',
        ts: now(),
        kind: 'system',
        title: 'Workspace initialized',
        detail: 'Aetherion core online · privacy mode: Local · sync: none',
      },
    ],
    installed: [] as string[],
    fs: { ...SEED_FS },
    git: { ...SEED_GIT },
    evalReports: [] as EvalReportSummary[],
  };
  return state;
};

export interface EvalReportSummary {
  id: string;
  model: string;
  provider: string;
  ts: string;
  metrics: {
    accuracy: number;
    factuality: number;
    hallucinationRate: number;
    completionRate: number;
    avgLatencyMs: number;
    p95LatencyMs: number;
    totalTokens: number;
    estimatedCostUsd: number;
    toolSuccessRate: number;
    securityScore: number;
    reproducibility: number;
  };
}

