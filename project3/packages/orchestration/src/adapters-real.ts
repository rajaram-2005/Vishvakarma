// Real, provider-connected adapters (§96 contract-compliant). These perform
// actual HTTP calls to live services when configured (env vars), and degrade
// gracefully when not. They share the ModelAdapter/PluginAdapter/McpAdapter
// contracts so the core can use them interchangeably with the mocks.

import { AdapterError, type ModelAdapter, type PluginAdapter, type McpAdapter } from './adapters';
import type { NodeExecutor } from './types';

export interface HttpModelConfig {
  baseUrl: string;
  apiKey?: string;
  modelId: string;
  capabilities?: string[];
}

function bearer(apiKey?: string): Record<string, string> {
  return apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
}

export class OpenAIChatAdapter implements ModelAdapter {
  version = '1.0';
  capabilities: string[];
  constructor(public id: string, private cfg: HttpModelConfig) {
    this.capabilities = cfg.capabilities ?? ['chat'];
  }

  async complete(prompt: string, opts: { maxTokens?: number } = {}): Promise<{ text: string; tokens: number; cost: number }> {
    if (prompt.trim() === '') throw new AdapterError('empty prompt', 'input');
    let res: Response;
    try {
      res = await fetch(`${this.cfg.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...bearer(this.cfg.apiKey) },
        body: JSON.stringify({ model: this.cfg.modelId, messages: [{ role: 'user', content: prompt }], max_tokens: opts.maxTokens ?? 512 }),
      });
    } catch (e) {
      throw new AdapterError(`network error: ${(e as Error).message}`, 'output');
    }
    if (res.status === 401) throw new AdapterError('unauthorized', 'auth');
    if (res.status === 429) throw new AdapterError('rate limited', 'rate-limit');
    if (!res.ok) throw new AdapterError(`status ${res.status}`, 'output');
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }>; usage?: { total_tokens?: number } };
    return {
      text: data.choices?.[0]?.message?.content ?? '',
      tokens: data.usage?.total_tokens ?? Math.ceil(prompt.length / 4),
      cost: 0,
    };
  }

  async health() {
    try {
      const r = await fetch(`${this.cfg.baseUrl}/models`, { headers: bearer(this.cfg.apiKey) });
      return r.ok ? 'healthy' : 'degraded';
    } catch {
      return 'unavailable';
    }
  }
}

export class OllamaAdapter implements ModelAdapter {
  version = '1.0';
  capabilities: string[];
  constructor(public id: string, private baseUrl = 'http://localhost:11434', modelId = 'llama3', capabilities: string[] = ['chat', 'local']) {
    this.capabilities = capabilities;
  }
  async complete(prompt: string): Promise<{ text: string; tokens: number; cost: number }> {
    if (prompt.trim() === '') throw new AdapterError('empty prompt', 'input');
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: this.id, messages: [{ role: 'user', content: prompt }], stream: false }),
    });
    if (!res.ok) throw new AdapterError(`ollama status ${res.status}`, 'output');
    const data = (await res.json()) as { message?: { content?: string } };
    return { text: data.message?.content ?? '', tokens: Math.ceil(prompt.length / 4), cost: 0 };
  }
  async health() {
    try {
      const r = await fetch(`${this.baseUrl}/api/tags`);
      return r.ok ? 'healthy' : 'unavailable';
    } catch {
      return 'unavailable';
    }
  }
}

export class AnthropicAdapter implements ModelAdapter {
  version = '1.0';
  capabilities: string[];
  constructor(public id: string, private cfg: HttpModelConfig) {
    this.capabilities = cfg.capabilities ?? ['chat'];
  }
  async complete(prompt: string, opts: { maxTokens?: number } = {}): Promise<{ text: string; tokens: number; cost: number }> {
    if (prompt.trim() === '') throw new AdapterError('empty prompt', 'input');
    const res = await fetch(`${this.cfg.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': this.cfg.apiKey ?? '', 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: this.cfg.modelId, max_tokens: opts.maxTokens ?? 512, messages: [{ role: 'user', content: prompt }] }),
    });
    if (!res.ok) throw new AdapterError(`status ${res.status}`, 'output');
    const data = (await res.json()) as { content?: Array<{ text?: string }> };
    return { text: data.content?.[0]?.text ?? '', tokens: Math.ceil(prompt.length / 4), cost: 0 };
  }
  async health() {
    return 'healthy' as const;
  }
}

export class HttpPluginAdapter implements PluginAdapter {
  version = '1.0';
  constructor(public id: string, private baseUrl: string) {}
  async run(input: unknown): Promise<unknown> {
    const res = await fetch(`${this.baseUrl}/run`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ input }) });
    if (!res.ok) throw new AdapterError(`plugin status ${res.status}`, 'output');
    return res.json();
  }
}

export class HttpMcpAdapter implements McpAdapter {
  version = '1.0';
  constructor(public id: string, private baseUrl: string) {}
  async call(tool: string, args: Record<string, unknown>): Promise<unknown> {
    const res = await fetch(`${this.baseUrl}/tools/call`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/call', params: { name: tool, arguments: args }, id: 1 }),
    });
    if (!res.ok) throw new AdapterError(`mcp status ${res.status}`, 'output');
    return res.json();
  }
}

/** Registry of live adapters; the executor for a real run resolves models here. */
export class AdapterRegistry {
  private models = new Map<string, ModelAdapter>();
  private plugins = new Map<string, PluginAdapter>();
  private mcps = new Map<string, McpAdapter>();

  registerModel(a: ModelAdapter): void {
    this.models.set(a.id, a);
  }
  registerPlugin(a: PluginAdapter): void {
    this.plugins.set(a.id, a);
  }
  registerMcp(a: McpAdapter): void {
    this.mcps.set(a.id, a);
  }
  getModel(id: string): ModelAdapter | undefined {
    return this.models.get(id);
  }
  listModels(): ModelAdapter[] {
    return [...this.models.values()];
  }
  async complete(modelId: string, prompt: string, opts?: { maxTokens?: number }): Promise<{ text: string; tokens: number; cost: number }> {
    const a = this.models.get(modelId);
    if (!a) throw new AdapterError(`unknown model ${modelId}`, 'input');
    return a.complete(prompt, opts);
  }
  runPlugin(id: string, input: unknown): Promise<unknown> {
    const a = this.plugins.get(id);
    if (!a) throw new AdapterError(`unknown plugin ${id}`, 'input');
    return a.run(input);
  }
  callMcp(id: string, tool: string, args: Record<string, unknown>): Promise<unknown> {
    const a = this.mcps.get(id);
    if (!a) throw new AdapterError(`unknown mcp ${id}`, 'input');
    return a.call(tool, args);
  }
}

/** Build a core NodeExecutor that delegates node execution to live adapters. */
export function adapterExecutor(registry: AdapterRegistry, defaultModelId: string): NodeExecutor {
  return {
    async execute(node) {
      const model = node.model ?? defaultModelId;
      try {
        const r = await registry.complete(model, String(node.input?.text ?? node.name));
        return { result: r.text, evidence: [`model:${model}`] };
      } catch (e) {
        if (e instanceof AdapterError) throw e;
        throw new AdapterError((e as Error).message, 'output');
      }
    },
  };
}

/** Seed a registry from the environment (no-op when keys are absent). */
export function registryFromEnv(): AdapterRegistry {
  const reg = new AdapterRegistry();
  if (process.env.OPENAI_API_KEY || process.env.OPENAI_BASE_URL) {
    reg.registerModel(
      new OpenAIChatAdapter('openai', {
        baseUrl: process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1',
        apiKey: process.env.OPENAI_API_KEY,
        modelId: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
        capabilities: ['chat', 'code', 'writing'],
      }),
    );
  }
  if (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_BASE_URL) {
    reg.registerModel(
      new AnthropicAdapter('anthropic', {
        baseUrl: process.env.ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com',
        apiKey: process.env.ANTHROPIC_API_KEY,
        modelId: process.env.ANTHROPIC_MODEL ?? 'claude-3-5-sonnet-latest',
        capabilities: ['chat', 'writing'],
      }),
    );
  }
  if (process.env.OLLAMA_URL) {
    reg.registerModel(new OllamaAdapter('ollama', process.env.OLLAMA_URL, process.env.OLLAMA_MODEL ?? 'llama3'));
  }
  return reg;
}
