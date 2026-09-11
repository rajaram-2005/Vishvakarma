// Vault Secrets Bridge — example plugin entry point.
// Demonstrates the plugin-sdk contract: declare tools, gate on the gateway,
// mask values. Never touches the network, never writes.
import type { Plugin, ToolDef } from '@sutra/plugin-sdk';

const vaultPath = process.env.Aetherion_VAULT_PATH ?? 'secrets/vault.env';

function loadVault(): Record<string, string> {
  // fs.read through the gateway (low risk)
  const fs = require('node:fs');
  const raw = fs.readFileSync(vaultPath, 'utf-8');
  const out: Record<string, string> = {};
  for (const line of raw.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

function mask(v: string): string {
  if (v.length <= 4) return '****';
  return v.slice(0, 2) + '…' + v.slice(-2) + ` (${v.length})`;
}

export const plugin: Plugin = {
  manifest: {
    id: 'vault-secrets',
    name: 'Vault Secrets Bridge',
    version: '0.2.0',
  },
  tools: [
    {
      id: 'vault.list',
      name: 'List secret names',
      risk: 'medium',
      run: async () => {
        const names = Object.keys(loadVault());
        return { ok: true, names, note: 'names only — values require vault.get with approval' };
      },
    },
    {
      id: 'vault.get',
      name: 'Read one secret',
      risk: 'critical', // the gateway will ALWAYS ask the human, even with a session grant
      run: async (ctx: { key: string }) => {
        const v = loadVault()[ctx.key];
        if (!v) return { ok: false, error: 'not found' };
        // the value crosses the boundary exactly once, to the requesting tool;
        // logs/traces carry only the mask
        return { ok: true, value: v, masked: mask(v) };
      },
    },
  ] as ToolDef[],
};
