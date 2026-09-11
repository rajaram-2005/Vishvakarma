// Aetherion — Project 3. Core domain types.
// Provider-neutral, serializable, local-first.

export type ID = string;

export type Theme = 'dark' | 'light' | 'aurora';
export type PrivacyMode = 'local' | 'cloud' | 'hybrid';
export type SyncScope = 'none' | 'metadata' | 'projects' | 'folders' | 'workspace';
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type ApprovalDecision = 'allow-once' | 'allow-session' | 'inspect' | 'deny';

export interface Settings {
  theme: Theme;
  reducedMotion: 'system' | 'on' | 'off';
  ambientSound: boolean;
  ambientVolume: number; // 0..1
  privacyMode: PrivacyMode;
  syncScope: SyncScope;
  providers: {
    ollamaUrl: string;
    openaiBaseUrl: string;
    openaiApiKey: string;
    openaiModel: string;
    otlpEndpoint: string;
  };
  /**
   * Optional Aetherion service API (services/api). Empty/unset = the workspace
   * runs entirely on the local core. In local privacy mode this is IGNORED
   * and enforced offline — the contract, not a recommendation.
   */
  server?: { baseUrl: string };
  /**
   * Optional Aetheris One bridge (a local Intelligence OS by the same author:
   * github.com/rajaram-2005/Aetheris). Points at its HTTP API, usually
   * http://localhost:3100 when running with `npm run dev -- --port 3100`.
   */
  aetheris?: { baseUrl: string };
}

export interface SutraTask {
  id: ID;
  title: string;
  description: string;
  priority: 'p0' | 'p1' | 'p2' | 'p3';
  category: string;
  tags: string[];
  due: string | null; // ISO date
  assignee: { kind: 'human' | 'agent'; id: ID; name: string };
  status: 'todo' | 'doing' | 'done';
  archived: boolean;
  order: number;
  createdAt: string;
}

export interface Project {
  id: ID;
  name: string;
  description: string;
  template: 'mvp' | 'service' | 'research' | 'blank';
  color: string;
  createdAt: string;
}

export interface ChatMessage {
  id: ID;
  role: 'user' | 'assistant' | 'system';
  content: string;
  ts: string;
  model?: string;
  route?: { analysis: string; chosen: string; chosenName: string; reasons: string[] };
}

export interface Conversation {
  id: ID;
  title: string;
  createdAt: string;
  messages: ChatMessage[];
}

export interface AgentDef {
  id: ID;
  name: string;
  role: string;
  model: string;
  tools: string[];
  skills: string[];
  permissions: string[];
  system: string;
  color: string;
}

export interface TeamDef {
  id: ID;
  name: string;
  goal: string;
  orchestrator: ID;
  members: ID[];
  createdAt: string;
}

export interface SkillDef {
  id: ID;
  name: string;
  kind: 'skill' | 'plugin';
  description: string;
  version: string;
  license: string;
  author: string;
  scopes: string[];
  installed: boolean;
  builtin: boolean;
}

export interface WorkflowNode {
  id: ID;
  type: string;
  label: string;
  config: Record<string, string>;
}

export interface Workflow {
  id: ID;
  name: string;
  description: string;
  trigger: 'manual' | 'schedule' | 'webhook' | 'event';
  schedule?: string;
  nodes: WorkflowNode[];
  edges: Array<[ID, ID]>;
  updatedAt: string;
}

export interface McpServer {
  id: ID;
  name: string;
  transport: 'stdio' | 'http';
  command?: string;
  url?: string;
  version: string;
  status: 'healthy' | 'degraded' | 'offline' | 'unknown';
  tools: Array<{ name: string; description: string }>;
  scopes: string[];
  installed: boolean;
  lastCheck?: string;
}

export interface ToolDef {
  id: ID;
  name: string;
  category: string;
  description: string;
  risk: RiskLevel;
  scopes: string[];
  enabled: boolean;
  sandbox: 'none' | 'workspace' | 'full';
}

export interface MemoryEntry {
  id: ID;
  kind: 'fact' | 'preference' | 'episodic';
  text: string;
  source: string;
  ts: string;
}

export interface KnowledgeDoc {
  id: ID;
  title: string;
  source: string;
  kind: 'text' | 'url' | 'github' | 'folder' | 'api' | 'database';
  createdAt: string;
  chars: number;
  chunkCount: number;
}

export interface Span {
  id: ID;
  traceId: ID;
  name: string;
  kind: string;
  start: number; // ms since epoch
  end: number;
  status: 'ok' | 'error';
  attrs: Record<string, string>;
}

export interface Trace {
  id: ID;
  name: string;
  start: number;
  end: number;
  status: 'ok' | 'error';
  spans: Span[];
}

export interface Approval {
  id: ID;
  createdAt: string;
  source: string;
  action: string;
  detail: string;
  risk: RiskLevel;
  reasons: string[];
  status: 'pending' | 'approved' | 'denied';
  decision?: ApprovalDecision;
}

export interface Deployment {
  id: ID;
  name: string;
  target: 'local' | 'docker' | 'puter';
  status: 'building' | 'success' | 'failed';
  createdAt: string;
  url?: string;
  log: string[];
}

export interface ActivityEvent {
  id: ID;
  ts: string;
  kind: string;
  title: string;
  detail: string;
  traceId?: ID;
}

export interface CatalogItem {
  id: ID;
  kind: 'skill' | 'plugin' | 'workflow' | 'mcp' | 'model';
  name: string;
  description: string;
  version: string;
  author: string;
  license: string;
  scopes: string[];
  tags: string[];
}

export interface ModelInfo {
  id: ID;
  name: string;
  provider: string;
  runtime:
    | 'sutra-local'
    | 'ollama'
    | 'vllm'
    | 'sglang'
    | 'llamacpp'
    | 'transformers'
    | 'mlx'
    | 'onnx'
    | 'trtllm'
    | 'openai-compat'
    | 'puter-cloud';
  contextWindow: number;
  costIn: number; // USD per 1k input tokens
  costOut: number; // USD per 1k output tokens
  latencyTier: 'low' | 'medium' | 'high';
  capabilities: Array<'code' | 'math' | 'long-context' | 'creative' | 'structured' | 'vision'>;
  available: boolean;
  local: boolean;
}

export interface GitCommit {
  hash: string;
  message: string;
  files: string[];
  ts: string;
  branch: string;
}
export interface GitState {
  branch: string;
  log: GitCommit[];
  lastFs: Record<string, string>;
  remote: boolean;
}
