import { describe, it, expect } from 'vitest';
import { CapabilityRegistry, compareVersions } from './capabilities';
import type { CapabilityContract } from './types';

const cap = (over: Partial<CapabilityContract> & Pick<CapabilityContract, 'id' | 'version' | 'type'>): CapabilityContract => ({
  provider: 'test',
  capabilities: [],
  inputs: [],
  outputs: [],
  dependencies: [],
  permissions: [],
  modalities: [],
  runtime: 'local',
  hardware: ['cpu'],
  network: 'none',
  license: 'MIT',
  securityLevel: 'public',
  availability: 'stable',
  ...over,
});

describe('CapabilityRegistry', () => {
  it('registers and retrieves by id/version', () => {
    const r = new CapabilityRegistry();
    r.register(cap({ id: 'm', version: '1.0', type: 'model' }));
    r.register(cap({ id: 'm', version: '2.0', type: 'model' }));
    expect(r.get('m')?.version).toBe('2.0'); // latest without version
    expect(r.get('m', '1.0')?.version).toBe('1.0');
    expect(r.versionsOf('m').map((c) => c.version)).toEqual(['2.0', '1.0']);
  });

  it('rejects contracts missing required fields', () => {
    const r = new CapabilityRegistry();
    expect(() => r.register({ id: '', version: '1', type: 'model' } as CapabilityContract)).toThrow();
  });

  it('filters by type and removes', () => {
    const r = new CapabilityRegistry();
    r.register(cap({ id: 'a', version: '1.0', type: 'model' }));
    r.register(cap({ id: 'b', version: '1.0', type: 'plugin' }));
    expect(r.byType('model')).toHaveLength(1);
    expect(r.remove('a')).toBe(true);
    expect(r.get('a')).toBeUndefined();
  });

  it('resolves transitive dependencies', () => {
    const r = new CapabilityRegistry();
    r.register(cap({ id: 'top', version: '1.0', type: 'plugin', dependencies: ['mid'] }));
    r.register(cap({ id: 'mid', version: '1.0', type: 'tool', dependencies: ['leaf'] }));
    r.register(cap({ id: 'leaf', version: '1.0', type: 'tool' }));
    const deps = r.resolveDependencies('top');
    expect(deps).toContain('mid@1.0');
    expect(deps).toContain('leaf@1.0');
    expect(r.missingDependencies('top')).toEqual([]);
  });

  it('reports missing dependencies', () => {
    const r = new CapabilityRegistry();
    r.register(cap({ id: 'top', version: '1.0', type: 'plugin', dependencies: ['ghost'] }));
    expect(r.missingDependencies('top')).toEqual(['ghost']);
  });

  it('detects composability by output/input', () => {
    const r = new CapabilityRegistry();
    const producer = cap({ id: 'rag', version: '1.0', type: 'tool', outputs: ['chunks'], modalities: ['text-to-text'] });
    const consumer = cap({ id: 'writer', version: '1.0', type: 'model', inputs: ['chunks'] });
    expect(r.canCompose(producer, consumer)).toBe(true);
    const other = cap({ id: 'x', version: '1.0', type: 'model', inputs: ['video'] });
    expect(r.canCompose(producer, other)).toBe(false);
  });

  it('compares versions semver-ish', () => {
    expect(compareVersions('1.0.0', '1.0.1')).toBeLessThan(0);
    expect(compareVersions('2.0', '1.9.9')).toBeGreaterThan(0);
    expect(compareVersions('1.0', '1.0')).toBe(0);
  });
});
