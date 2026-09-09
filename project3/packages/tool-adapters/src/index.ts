import { assess, type ToolCategory } from '@sutra/shared';
import type { ToolDef } from '@sutra/shared';

// Built-in tool arsenal. Risk and sandbox level are declared per tool;
// the gateway enforces them at call time — never silently.

export const BUILTIN_TOOLS: ToolDef[] = [
  {
    id: 'fs.read',
    name: 'Filesystem Read',
    category: 'fs.read',
    description: 'Read files in the workspace. Isolated virtual FS on web; real (sandboxed) FS on desktop.',
    risk: 'low',
    scopes: ['fs.read'],
    enabled: true,
    sandbox: 'workspace',
  },
  {
    id: 'fs.write',
    name: 'Filesystem Write',
    category: 'fs.write',
    description: 'Create and edit files inside the workspace boundary.',
    risk: 'low',
    scopes: ['fs.write'],
    enabled: true,
    sandbox: 'workspace',
  },
  {
    id: 'terminal.exec',
    name: 'Terminal',
    category: 'terminal.exec',
    description: 'Shell access. Every command is classified; dangerous signatures escalate to approval.',
    risk: 'medium',
    scopes: ['terminal'],
    enabled: true,
    sandbox: 'full',
  },
  {
    id: 'browser.nav',
    name: 'Browser Automation',
    category: 'browser.action',
    description: 'Navigate, click, extract and verify web UIs through an isolated browser session.',
    risk: 'medium',
    scopes: ['browser'],
    enabled: true,
    sandbox: 'workspace',
  },
  {
    id: 'git.ops',
    name: 'Git',
    category: 'git.push',
    description: 'Branches, commits, diffs and pushes. Push and force-push always pass the policy check.',
    risk: 'medium',
    scopes: ['git'],
    enabled: true,
    sandbox: 'workspace',
  },
  {
    id: 'api.fetch',
    name: 'HTTP / APIs',
    category: 'network.request',
    description: 'Request any endpoint with typed retries. Outbound domains are policy-filterable.',
    risk: 'medium',
    scopes: ['network'],
    enabled: true,
    sandbox: 'workspace',
  },
  {
    id: 'db.query',
    name: 'Databases',
    category: 'db.write',
    description: 'SQL and document-store queries. Writes and DDL require approval by default.',
    risk: 'high',
    scopes: ['db'],
    enabled: true,
    sandbox: 'workspace',
  },
  {
    id: 'docs.read',
    name: 'Documents',
    category: 'fs.read',
    description: 'Parse PDFs, markdown, HTML and office docs into the knowledge pipeline.',
    risk: 'low',
    scopes: ['fs.read'],
    enabled: true,
    sandbox: 'workspace',
  },
  {
    id: 'code.exec',
    name: 'Code Execution',
    category: 'code.exec',
    description: 'Run generated code in a disposable sandbox with resource limits.',
    risk: 'high',
    scopes: ['code'],
    enabled: true,
    sandbox: 'full',
  },
  {
    id: 'computer.use',
    name: 'Computer Use',
    category: 'computer.use',
    description: 'GUI-level control (mouse, keyboard, screenshots). Session-scoped, fully audited.',
    risk: 'high',
    scopes: ['computer'],
    enabled: false,
    sandbox: 'full',
  },
  {
    id: 'deploy.run',
    name: 'Deployment',
    category: 'deploy',
    description: 'Ship builds to local, Docker or Puter cloud targets with pre-deploy security scan.',
    risk: 'critical',
    scopes: ['deploy'],
    enabled: true,
    sandbox: 'workspace',
  },
];

export interface ToolCall {
  tool: string;
  category: ToolCategory;
  detail: string;
  args?: Record<string, unknown>;
}

export interface GatewayVerdict {
  allowed: boolean;
  risk: 'low' | 'medium' | 'high' | 'critical';
  needsApproval: boolean;
  reasons: string[];
}

export interface ToolGateway {
  /**
   * Agent → Tool Gateway → Policy.
   * `sessionAllowed` holds categories the user approved for this session.
   */
  check(call: ToolCall, sessionAllowed: ReadonlySet<string>): GatewayVerdict;
}

export function createGateway(): ToolGateway {
  return {
    check(call, sessionAllowed) {
      const a = assess(call.category, call.detail);
      const sessionOk = sessionAllowed.has(call.category);
      // Critical risk is never masked by a session grant — it always asks again.
      const needsApproval = a.risk === 'critical' || (a.requiresApproval && !sessionOk);
      return { allowed: !needsApproval, risk: a.risk, needsApproval, reasons: a.reasons };
    },
  };
}
