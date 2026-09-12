// §54 / §55 / §56 — API Platform, SDK and Webhooks.
//
// Scoped API keys, a thin SDK that calls the core, and an outgoing webhook
// dispatcher with signature + retries plus incoming signature verification.

import type { OrchestrationCore } from './core';
import type { CompatibilityContext, NodeExecutor, TaskGraph } from './types';

/** Simple deterministic key hash (stand-in for a real KDF; demo only). */
function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export interface ApiKeyRecord {
  id: string;
  prefix: string;
  hash: string;
  scopes: string[];
  createdAt: string;
}

export class APIKeyManager {
  private keys = new Map<string, ApiKeyRecord>();

  create(scopes: string[], id = `key_${Math.random().toString(36).slice(2, 8)}`): { plaintext: string; record: ApiKeyRecord } {
    const secret = `${id}.${Math.random().toString(36).slice(2)}`;
    const record: ApiKeyRecord = {
      id,
      prefix: secret.slice(0, 8),
      hash: hash(secret),
      scopes,
      createdAt: new Date().toISOString(),
    };
    this.keys.set(id, record);
    return { plaintext: secret, record };
  }

  verify(secret: string): ApiKeyRecord | null {
    const h = hash(secret);
    for (const k of this.keys.values()) if (k.hash === h) return k;
    return null;
  }

  hasScope(record: ApiKeyRecord, scope: string): boolean {
    return record.scopes.includes('*') || record.scopes.includes(scope);
  }
}

/** §55 — A minimal SDK that drives the core through typed methods. */
export class Sdk {
  constructor(private readonly core: OrchestrationCore) {}

  async sendChat(text: string, ctx: CompatibilityContext = { offline: false, privacyMode: 'cloud', grantedPermissions: ['*'] }) {
    const { graph } = this.core.plan(text);
    return this.core.run(graph, this.coreExecutor(), { context: ctx });
  }

  createBot(name: string, model: string) {
    return this.core.registerCapability({
      id: `bot:${name}`,
      version: '1.0',
      type: 'bot',
      provider: 'user',
      capabilities: [model],
      inputs: ['text'],
      outputs: ['text'],
      dependencies: [model],
      permissions: [],
      modalities: ['text-to-text'],
      runtime: 'cloud',
      hardware: [],
      network: 'required',
      license: 'proprietary',
      securityLevel: 'public',
      availability: 'stable',
    });
  }

  runWorkflow(graph: TaskGraph, executor: NodeExecutor, ctx: CompatibilityContext = { offline: false, privacyMode: 'cloud', grantedPermissions: ['*'] }) {
    return this.core.run(graph, executor, { context: ctx });
  }

  searchLibrary(q: string) {
    return q;
  }

  private coreExecutor(): NodeExecutor {
    return {
      async execute(node) {
        return { result: `ok:${node.id}`, evidence: [`ev:${node.id}`] };
      },
    };
  }
}

export type WebhookTransport = (url: string, body: string, signature: string) => Promise<boolean>;

/** §56 — Outgoing webhooks with HMAC signature + retries. */
export class WebhookSystem {
  private endpoints: Array<{ url: string; secret: string }> = [];
  constructor(private readonly transport: WebhookTransport = defaultTransport) {}

  register(url: string, secret: string): void {
    this.endpoints.push({ url, secret });
  }

  private sign(secret: string, body: string): string {
    // Demonstration signature (replace with HMAC-SHA256 in production).
    return hash(`${secret}:${body}`);
  }

  async dispatch(event: string, payload: unknown, retries = 3): Promise<boolean> {
    const body = JSON.stringify({ event, payload, at: new Date().toISOString() });
    let ok = true;
    for (const ep of this.endpoints) {
      const sig = this.sign(ep.secret, body);
      let attempt = 0;
      let delivered = false;
      while (attempt < retries && !delivered) {
        delivered = await this.transport(ep.url, body, sig);
        attempt += 1;
      }
      if (!delivered) ok = false;
    }
    return ok;
  }

  /** Verify an incoming webhook signature. */
  verify(body: string, secret: string, signature: string): boolean {
    return this.sign(secret, body) === signature;
  }
}

async function defaultTransport(_url: string, _body: string, _sig: string): Promise<boolean> {
  // No real network by default; tests inject a transport.
  return true;
}
