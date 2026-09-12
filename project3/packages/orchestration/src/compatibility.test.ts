import { describe, it, expect } from 'vitest';
import { CapabilityRegistry } from './capabilities';
import { CompatibilityEngine } from './compatibility';
import type { CapabilityContract, CompatibilityContext } from './types';

const base: CapabilityContract = {
  id: 'tool',
  version: '1.0',
  type: 'tool',
  provider: 'test',
  capabilities: ['search'],
  inputs: ['text'],
  outputs: ['text'],
  dependencies: [],
  permissions: ['network.request'],
  modalities: ['text-to-text'],
  runtime: 'cloud',
  hardware: ['cpu'],
  network: 'required',
  license: 'MIT',
  securityLevel: 'public',
  availability: 'stable',
};

const ctx = (over: Partial<CompatibilityContext> = {}): CompatibilityContext => ({
  offline: false,
  privacyMode: 'cloud',
  grantedPermissions: ['*'],
  ...over,
});

describe('CompatibilityEngine', () => {
  it('passes a capable, online, permitted capability', () => {
    const e = new CompatibilityEngine();
    const r = e.analyze({ required: base, available: [], context: ctx() });
    expect(r.compatible).toBe(true);
    expect(r.reasons).toHaveLength(0);
  });

  it('fails when offline but network is required', () => {
    const e = new CompatibilityEngine();
    const r = e.analyze({ required: base, available: [], context: ctx({ offline: true }) });
    expect(r.compatible).toBe(false);
    expect(r.checks.find((c) => c.name === 'network')?.ok).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/offline/i);
  });

  it('fails on missing permissions', () => {
    const e = new CompatibilityEngine();
    const r = e.analyze({ required: base, available: [], context: ctx({ grantedPermissions: [] }) });
    expect(r.compatible).toBe(false);
    expect(r.checks.find((c) => c.name === 'permission')?.ok).toBe(false);
  });

  it('blocks cloud capability in local privacy mode unless local-only', () => {
    const e = new CompatibilityEngine();
    const cloud = { ...base, privacy: undefined as never };
    const r1 = e.analyze({ required: cloud, available: [], context: ctx({ privacyMode: 'local' }) });
    expect(r1.compatible).toBe(false);

    const localOnly = { ...base, runtime: 'local' as const, network: 'none' as const, privacy: 'local-only' as const };
    const r2 = e.analyze({ required: localOnly, available: [], context: ctx({ privacyMode: 'local', offline: true }) });
    expect(r2.compatible).toBe(true);
  });

  it('enforces license allow/block lists', () => {
    const e = new CompatibilityEngine();
    const r1 = e.analyze({ required: { ...base, license: 'GPL-3.0' }, available: [], context: ctx({ allowedLicenses: ['MIT'] }) });
    expect(r1.compatible).toBe(false);
    const r2 = e.analyze({ required: base, available: [], context: ctx({ blockedLicenses: ['MIT'] }) });
    expect(r2.compatible).toBe(false);
  });

  it('rejects deprecated when configured', () => {
    const e = new CompatibilityEngine();
    const r = e.analyze({ required: { ...base, availability: 'deprecated' }, available: [], context: ctx({ rejectDeprecated: true }) });
    expect(r.compatible).toBe(false);
  });

  it('detects missing dependencies via a registry', () => {
    const reg = new CapabilityRegistry();
    const e = new CompatibilityEngine(reg);
    const needy: CapabilityContract = { ...base, id: 'needy', dependencies: ['missing-plugin'] };
    const r = e.analyze({ required: needy, available: [], context: ctx() });
    expect(r.compatible).toBe(false);
    expect(r.checks.find((c) => c.name === 'dependency')?.ok).toBe(false);
  });

  it('suggests a compatible fallback', () => {
    const e = new CompatibilityEngine();
    const offlineCloud = { ...base, network: 'required' as const };
    const localAlt: CapabilityContract = { ...base, id: 'local-alt', runtime: 'local', network: 'none', permissions: [] };
    const r = e.analyze({
      required: offlineCloud,
      available: [localAlt],
      context: ctx({ offline: true }),
      fallbackPool: [localAlt],
    });
    expect(r.compatible).toBe(false);
    expect(r.fallbackId).toBe('local-alt');
  });
});
