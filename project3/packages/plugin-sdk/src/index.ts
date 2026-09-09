// SUTRA plugin SDK — manifest-first plugins with explicit scopes.
// A plugin only ever gets the scopes the user approves at install time.

export const VALID_SCOPES = [
  'fs.read',
  'fs.write',
  'terminal',
  'network',
  'browser',
  'memory.read',
  'memory.write',
  'models',
  'deploy',
  'secrets',
] as const;

export type Scope = (typeof VALID_SCOPES)[number];

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  license: string;
  entry: string;
  scopes: string[];
  minSutra: string;
}

export function validateManifest(m: PluginManifest): string[] {
  const errs: string[] = [];
  if (!m.id?.trim()) errs.push('manifest needs an id');
  if (!m.name?.trim()) errs.push('manifest needs a name');
  if (!m.version || !/^\d+\.\d+\.\d+/.test(m.version)) errs.push('version must be semver (x.y.z)');
  if (!m.entry?.trim()) errs.push('manifest needs an entry point');
  if (!Array.isArray(m.scopes)) errs.push('scopes must be an array');
  else {
    for (const s of m.scopes) {
      if (!(VALID_SCOPES as readonly string[]).includes(s)) errs.push(`unknown scope "${s}"`);
    }
  }
  if ((m.scopes ?? []).includes('secrets') && !/secrets/.test(m.description ?? '')) {
    errs.push('plugins requesting "secrets" scope must describe why');
  }
  return errs;
}

export function permissionSummary(m: PluginManifest): string {
  const dangerous = m.scopes.filter((s) => ['secrets', 'deploy', 'terminal'].includes(s));
  const base = m.scopes.length ? `needs: ${m.scopes.join(', ')}` : 'no scopes requested';
  return dangerous.length ? `${base} · elevated: ${dangerous.join(', ')}` : base;
}
