// Aetherion — bundled marketplace catalog.
// Installing an item lands it in the local registry with its declared scopes.

import type { CatalogItem, Workflow, WorkflowNode, McpServer, SkillDef } from '@sutra/shared';
import { PLUGIN_CATALOG } from './catalog-plugins';

export const CATALOG: CatalogItem[] = [
  ...PLUGIN_CATALOG,
  { id: 'cat-rag-tuning', kind: 'skill', name: 'RAG Tuning', description: 'Chunk sizes, overlap, rerank blends and citation formats for grounded answers.', version: '1.0.0', author: 'Aetherion', license: 'MIT', scopes: ['fs.read'], tags: ['rag', 'knowledge'] },
  { id: 'cat-data-pipeline', kind: 'skill', name: 'Data Pipeline', description: 'Source → normalize → validate → store, with idempotent steps.', version: '0.9.2', author: 'Aetherion', license: 'MIT', scopes: ['db', 'network'], tags: ['data'] },
  { id: 'cat-prompt-craft', kind: 'skill', name: 'Prompt Craft', description: 'Role, context, format, examples, constraints — in that order.', version: '1.0.0', author: 'Aetherion', license: 'MIT', scopes: [], tags: ['prompts'] },
  { id: 'cat-incident-response', kind: 'skill', name: 'Incident Response', description: 'Detect, contain, communicate, fix, post-mortem without blame.', version: '1.0.1', author: 'Aetherion', license: 'MIT', scopes: ['terminal', 'db'], tags: ['ops'] },
  { id: 'cat-deploy-checklist', kind: 'skill', name: 'Deploy Checklist', description: 'Env check, secrets scan, canary, health probes, rollback plan.', version: '1.1.1', author: 'Aetherion', license: 'MIT', scopes: ['deploy'], tags: ['deploy'] },
  { id: 'cat-linear-bridge', kind: 'plugin', name: 'Linear Bridge', description: 'Sync tasks between Aetherion projects and a Linear team via API.', version: '0.3.0', author: 'sutra-community', license: 'MIT', scopes: ['network', 'memory.write'], tags: ['tasks', 'sync'] },
  { id: 'cat-notion-sync', kind: 'plugin', name: 'Notion Sync', description: 'Two-way sync of project docs into Notion pages (selected folders only).', version: '1.2.3', author: 'sutra-community', license: 'MIT', scopes: ['network', 'fs.read'], tags: ['docs', 'sync'] },
  { id: 'cat-sentry-mcp', kind: 'mcp', name: 'Sentry MCP', description: 'Issues, releases and stack traces through a remote MCP server.', version: '1.4.0', author: 'Sentry', license: 'SSPL', scopes: ['network'], tags: ['monitoring'] },
  { id: 'cat-github-mcp', kind: 'mcp', name: 'GitHub MCP', description: 'Repositories, issues, PRs via the official GitHub MCP endpoint.', version: '1.0.0', author: 'GitHub', license: 'MIT', scopes: ['git', 'network'], tags: ['github'] },
  { id: 'cat-puppeteer-mcp', kind: 'mcp', name: 'Puppeteer MCP', description: 'Headless browser: navigate, click, screenshot for verification steps.', version: '2.1.0', author: 'MCP community', license: 'MIT', scopes: ['browser'], tags: ['browser'] },
  { id: 'cat-oncall-workflow', kind: 'workflow', name: 'On-Call Handoff', description: 'Summarize the last 24h of incidents and post the handoff note.', version: '1.1.0', author: 'sutra-community', license: 'MIT', scopes: ['terminal'], tags: ['ops'] },
  { id: 'cat-digest-workflow', kind: 'workflow', name: 'Weekly Digest', description: 'Gather activity, run the smoke eval, post a digest to the team channel.', version: '0.9.0', author: 'sutra-community', license: 'MIT', scopes: ['models'], tags: ['reporting'] },
  { id: 'cat-phi4-model', kind: 'model', name: 'Phi-4 Mini (preset)', description: 'Small reasoning model preset — math and structured tasks, cheap to run.', version: '4.0', author: 'Microsoft', license: 'MIT', scopes: ['models'], tags: ['model', 'math'] },
  { id: 'cat-gemma-model', kind: 'model', name: 'Gemma 2 9B (preset)', description: 'General structured tasks on modest hardware via llama.cpp.', version: '2.0', author: 'Google', license: 'Gemma terms', scopes: ['models'], tags: ['model'] },
];

export function catalogItemToSkill(c: CatalogItem): SkillDef {
  return {
    id: c.id,
    name: c.name,
    kind: c.kind === 'plugin' ? 'plugin' : 'skill',
    description: c.description,
    version: c.version,
    license: c.license,
    author: c.author,
    scopes: c.scopes,
    installed: true,
    builtin: false,
  };
}

export function catalogItemToWorkflow(c: CatalogItem): Workflow {
  const base: WorkflowNode[] = [
    { id: 'w1', type: 'trigger', label: c.id === 'cat-oncall-workflow' ? 'Daily 09:00' : 'Weekly Monday', config: {} },
    { id: 'w2', type: 'ai', label: 'Gather + summarize', config: { prompt: c.description } },
    { id: 'w3', type: 'approval', label: 'Human review', config: {} },
    { id: 'w4', type: 'notify', label: 'Post digest', config: { message: c.name } },
  ];
  return {
    id: c.id,
    name: c.name,
    description: c.description,
    trigger: 'schedule',
    schedule: c.id === 'cat-oncall-workflow' ? '0 9 * * *' : '0 8 * * 1',
    nodes: base,
    edges: [
      ['w1', 'w2'],
      ['w2', 'w3'],
      ['w3', 'w4'],
    ],
    updatedAt: new Date().toISOString(),
  };
}

export function catalogItemToMcp(c: CatalogItem): McpServer {
  const map: Record<string, Partial<McpServer>> = {
    'cat-sentry-mcp': {
      transport: 'http',
      url: 'https://mcp.sentry.dev/mcp',
      tools: [
        { name: 'get_issue', description: 'Fetch an issue with events' },
        { name: 'list_releases', description: 'Recent releases' },
      ],
    },
    'cat-github-mcp': {
      transport: 'http',
      url: 'https://api.githubcopilot.com/mcp/',
      tools: [
        { name: 'get_repository', description: 'Repository metadata' },
        { name: 'list_issues', description: 'Open issues' },
      ],
    },
    'cat-puppeteer-mcp': {
      transport: 'stdio',
      command: 'npx @modelcontextprotocol/server-puppeteer',
      tools: [
        { name: 'navigate', description: 'Open a page' },
        { name: 'screenshot', description: 'Capture a screenshot' },
      ],
    },
  };
  return {
    id: c.id,
    name: c.name,
    transport: (map[c.id]?.transport ?? 'http') as McpServer['transport'],
    url: map[c.id]?.url,
    command: map[c.id]?.command,
    version: c.version,
    status: 'unknown',
    tools: map[c.id]?.tools ?? [{ name: 'info', description: c.description.slice(0, 60) }],
    scopes: c.scopes,
    installed: true,
  };
}
