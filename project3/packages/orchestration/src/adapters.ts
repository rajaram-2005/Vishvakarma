// §96 — Contract Testing for adapters. Every adapter (model, plugin, MCP) must
// satisfy input/output/error/timeout/version contracts before it is trusted.

export class AdapterError extends Error {
  constructor(message: string, public readonly kind: 'input' | 'output' | 'timeout' | 'auth' | 'rate-limit') {
    super(message);
    this.name = 'AdapterError';
  }
}

export interface ModelAdapter {
  id: string;
  version: string;
  capabilities: string[];
  complete(prompt: string, opts?: { maxTokens?: number; timeoutMs?: number }): Promise<{ text: string; tokens: number; cost: number }>;
  health(): Promise<'healthy' | 'degraded' | 'unavailable'>;
}

export interface PluginAdapter {
  id: string;
  version: string;
  run(input: unknown, timeoutMs?: number): Promise<unknown>;
}

export interface McpAdapter {
  id: string;
  version: string;
  call(tool: string, args: Record<string, unknown>, timeoutMs?: number): Promise<unknown>;
}

export interface ContractReport {
  adapter: string;
  passed: string[];
  failed: string[];
  ok: boolean;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Validate any ModelAdapter against the spec's contract (§96). */
export async function contractTestModel(a: ModelAdapter): Promise<ContractReport> {
  const passed: string[] = [];
  const failed: string[] = [];
  const ok = (name: string, cond: boolean) => (cond ? passed.push(name) : failed.push(name));

  // Input contract
  try {
    await a.complete('');
    failed.push('input: rejects empty prompt');
  } catch (e) {
    ok('input: rejects empty prompt', e instanceof AdapterError && e.kind === 'input');
  }
  // Output contract
  const out = await a.complete('hello', { maxTokens: 10 });
  ok('output: returns text', typeof out.text === 'string' && out.text.length > 0);
  ok('output: reports tokens', typeof out.tokens === 'number' && out.tokens >= 0);
  // Version contract
  ok('version: exposes version', typeof a.version === 'string' && a.version.length > 0);
  // Error/time contract
  try {
    await a.complete('boom', { timeoutMs: 20 });
    failed.push('error: surfaces failures');
  } catch {
    passed.push('error: surfaces failures');
  }
  // Health contract
  const h = await a.health();
  ok('health: returns status', ['healthy', 'degraded', 'unavailable'].includes(h));

  return { adapter: a.id, passed, failed, ok: failed.length === 0 };
}

/** Validate any Plugin/MCP adapter call contract. */
export async function contractTestCallable(a: PluginAdapter | McpAdapter, kind: 'plugin' | 'mcp'): Promise<ContractReport> {
  const passed: string[] = [];
  const failed: string[] = [];
  const id = (a as { id: string }).id;
  const call = (a as McpAdapter).call
    ? (a as McpAdapter).call.bind(a as McpAdapter)
    : async () => (a as PluginAdapter).run.bind(a as PluginAdapter)({});
  const out = await call('test', {});
  if (out !== undefined) passed.push('output: returns value');
  else failed.push('output: returns value');
  if (typeof (a as { version: string }).version === 'string') passed.push('version: exposes version');
  else failed.push('version: exposes version');
  return { adapter: id, passed, failed, ok: failed.length === 0 };
}

/** A reference model adapter that satisfies the contract. */
export class MockModelAdapter implements ModelAdapter {
  constructor(public id: string, public version = '1.0', public capabilities: string[] = ['chat']) {}
  async complete(prompt: string, opts: { maxTokens?: number; timeoutMs?: number } = {}): Promise<{ text: string; tokens: number; cost: number }> {
    if (prompt.trim() === '') throw new AdapterError('empty prompt', 'input');
    if (prompt === 'boom') {
      await wait(opts.timeoutMs ?? 0);
      throw new AdapterError('simulated failure', 'output');
    }
    await wait(opts.timeoutMs && opts.timeoutMs < 10 ? 0 : 0);
    return { text: `reply to: ${prompt}`, tokens: Math.ceil(prompt.length / 4), cost: 0.001 };
  }
  async health() {
    return 'healthy' as const;
  }
}

export class MockPluginAdapter implements PluginAdapter {
  constructor(public id: string, public version = '1.0') {}
  async run(input: unknown): Promise<unknown> {
    return { echoed: input };
  }
}

export class MockMcpAdapter implements McpAdapter {
  constructor(public id: string, public version = '1.0') {}
  async call(tool: string, args: Record<string, unknown>): Promise<unknown> {
    return { tool, args };
  }
}
