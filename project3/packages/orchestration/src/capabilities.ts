// §2 / §4 — Capability Graph & Registry.
//
// A central, synchronous, node-safe registry of every discoverable
// capability. Components declare a machine-readable CapabilityContract so
// the platform can determine whether two components can actually work
// together (see compatibility.ts).

import type { CapabilityContract, CapabilityType } from './types';

export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x - y;
  }
  return 0;
}

export class CapabilityRegistry {
  private caps = new Map<string, CapabilityContract>();

  private key(id: string, version: string): string {
    return `${id}@${version}`;
  }

  /** Register (or overwrite) a capability contract at a specific version. */
  register(cap: CapabilityContract): CapabilityContract {
    if (!cap.id || !cap.version || !cap.type) {
      throw new Error('CapabilityContract requires id, version and type');
    }
    this.caps.set(this.key(cap.id, cap.version), cap);
    return cap;
  }

  /** Fetch a capability. Without a version, returns the highest version. */
  get(id: string, version?: string): CapabilityContract | undefined {
    if (version) return this.caps.get(this.key(id, version));
    const all = this.versionsOf(id);
    return all[0];
  }

  versionsOf(id: string): CapabilityContract[] {
    return [...this.caps.values()]
      .filter((c) => c.id === id)
      .sort((a, b) => compareVersions(b.version, a.version));
  }

  all(): CapabilityContract[] {
    return [...this.caps.values()];
  }

  byType(type: CapabilityType): CapabilityContract[] {
    return this.all().filter((c) => c.type === type);
  }

  /** Remove a specific version, or every version of an id. */
  remove(id: string, version?: string): boolean {
    if (version) return this.caps.delete(this.key(id, version));
    return this.versionsOf(id)
      .map((c) => this.caps.delete(this.key(c.id, c.version)))
      .some(Boolean);
  }

  /**
   * Resolve the full set of (transitive) dependency keys reachable from a
   * capability. Unmet dependencies are still included so callers can detect
   * them via missingDependencies().
   */
  resolveDependencies(id: string, version?: string): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    const visit = (cid: string, cver?: string): void => {
      const cap = this.get(cid, cver);
      if (!cap) {
        const key = cver ? `${cid}@${cver}` : cid;
        if (!seen.has(key)) {
          seen.add(key);
          out.push(key);
        }
        return;
      }
      for (const dep of cap.dependencies) {
        const [did, dver] = dep.split('@');
        const latest = this.get(did)?.version;
        const depKey = dver ? dep : latest ? `${did}@${latest}` : did;
        if (seen.has(depKey)) continue;
        seen.add(depKey);
        out.push(depKey);
        visit(did, dver);
      }
    };
    visit(id, version);
    return out;
  }

  /** Dependency ids that are declared but not registered. */
  missingDependencies(id: string, version?: string): string[] {
    return this.resolveDependencies(id, version).filter((k) => !this.caps.has(k));
  }

  /**
   * Determine whether two capabilities can be composed: the producer's
   * outputs must intersect the consumer's inputs, OR they share a modality.
   */
  canCompose(producer: CapabilityContract, consumer: CapabilityContract): boolean {
    const out = new Set(producer.outputs);
    const mod = new Set(producer.modalities);
    const inOk = consumer.inputs.some((i) => out.has(i));
    const modOk = consumer.modalities.some((m) => mod.has(m));
    return inOk || modOk;
  }
}
