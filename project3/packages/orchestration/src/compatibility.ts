// §3 — Compatibility Engine.
//
// Before executing a task, run a compatibility analysis chain:
//   dependency -> permission -> runtime -> hardware -> network -> license
//   -> policy (privacy) -> input/output -> model/plugin/mcp.
// Never connect incompatible components simply because they exist.

import type { CapabilityRegistry } from './capabilities';
import type {
  CompatibilityCheck,
  CompatibilityContext,
  CompatibilityReport,
  CompatibilityRequest,
  CapabilityContract,
} from './types';

export class CompatibilityEngine {
  constructor(private readonly registry?: CapabilityRegistry) {}

  /**
   * Analyze whether `required` can run under `context`, optionally composed
   * with `available` capabilities. If incompatible and a `fallbackPool` is
   * supplied, the first compatible fallback is suggested.
   */
  analyze(req: CompatibilityRequest): CompatibilityReport {
    const { required, available, context, fallbackPool = [] } = req;
    const checks: CompatibilityCheck[] = [];
    const reasons: string[] = [];

    // 1. Dependencies (registry-backed, if a registry is in play).
    if (this.registry) {
      const missing = this.registry.missingDependencies(required.id, required.version);
      const ok = missing.length === 0;
      checks.push({
        name: 'dependency',
        ok,
        detail: ok ? 'all dependencies resolved' : `missing: ${missing.join(', ')}`,
      });
      if (!ok) reasons.push(`Unmet dependency: ${missing.join(', ')}`);
    } else {
      checks.push({ name: 'dependency', ok: true, detail: 'no registry to verify against' });
    }

    // 2. Permissions.
    const granted = new Set(context.grantedPermissions);
    const missingPerms = required.permissions.filter(
      (p) => !granted.has('*') && !granted.has(p),
    );
    const permOk = missingPerms.length === 0;
    checks.push({
      name: 'permission',
      ok: permOk,
      detail: permOk ? 'permissions satisfied' : `missing: ${missingPerms.join(', ')}`,
    });
    if (!permOk) reasons.push(`Missing permission: ${missingPerms.join(', ')}`);

    // 3. Runtime + network availability.
    if (context.offline) {
      const netOk = required.network === 'none' || required.network === 'optional';
      checks.push({
        name: 'network',
        ok: netOk,
        detail: netOk ? 'works offline' : `requires network (${required.network}) but offline`,
      });
      if (!netOk) reasons.push('Requires network but system is offline');
    } else {
      checks.push({ name: 'network', ok: true, detail: 'online' });
    }

    // 4. Privacy policy: in local/private mode, never silently use a
    //    cloud-only capability.
    let privacyOk = true;
    if (context.privacyMode === 'local' && required.runtime === 'cloud') {
      privacyOk = required.privacy === 'local-only';
    }
    checks.push({
      name: 'policy',
      ok: privacyOk,
      detail: privacyOk ? 'privacy policy satisfied' : 'privacy=local forbids cloud-only capability',
    });
    if (!privacyOk) reasons.push('Privacy mode forbids cloud-only capability');

    // 5. Hardware.
    if (context.availableHardware && context.availableHardware.length) {
      const have = new Set(context.availableHardware);
      const hwOk = required.hardware.every((h) => h === 'cpu' || have.has(h));
      checks.push({
        name: 'hardware',
        ok: hwOk,
        detail: hwOk ? 'hardware satisfied' : `needs ${required.hardware.join(',')}`,
      });
      if (!hwOk) reasons.push(`Missing hardware: ${required.hardware.join(', ')}`);
    } else {
      checks.push({ name: 'hardware', ok: true, detail: 'no hardware constraint asserted' });
    }

    // 6. License.
    let licOk = true;
    if (context.allowedLicenses?.length && !context.allowedLicenses.includes(required.license)) {
      licOk = false;
    }
    if (context.blockedLicenses?.includes(required.license)) licOk = false;
    checks.push({
      name: 'license',
      ok: licOk,
      detail: licOk ? `license ${required.license} allowed` : `license ${required.license} not permitted`,
    });
    if (!licOk) reasons.push(`License ${required.license} not permitted`);

    // 7. Availability (deprecated rejection is optional via context).
    if (context.rejectDeprecated && required.availability === 'deprecated') {
      checks.push({ name: 'policy', ok: false, detail: 'capability is deprecated' });
      reasons.push('Capability is deprecated');
    } else {
      checks.push({
        name: 'policy',
        ok: true,
        detail: `availability=${required.availability}`,
      });
    }

    // 8. Composition (input/output) — informational unless explicit.
    const partner = this.findPartner(required, available);
    checks.push({
      name: required.type === 'mcp' ? 'mcp' : required.type === 'plugin' ? 'plugin' : 'model',
      ok: true,
      detail: partner ? `composes with ${partner.id}` : 'no downstream partner required',
    });

    const compatible = checks.every((c) => c.ok);

    const report: CompatibilityReport = { compatible, checks, reasons };
    if (!compatible && fallbackPool.length) {
      report.fallbackId = this.suggestFallback(required, available, context, fallbackPool);
    }
    return report;
  }

  /** Find a capability that can consume `required`'s outputs. */
  findPartner(required: CapabilityContract, available: CapabilityContract[]): CapabilityContract | undefined {
    const outs = new Set(required.outputs);
    const mods = new Set(required.modalities);
    return available.find(
      (a) =>
        a.id !== required.id &&
        (a.inputs.some((i) => outs.has(i)) || a.modalities.some((m) => mods.has(m))),
    );
  }

  /** Pick the first capability in `pool` that is itself compatible. */
  suggestFallback(
    _required: CapabilityContract,
    available: CapabilityContract[],
    context: CompatibilityContext,
    pool: CapabilityContract[],
  ): string | undefined {
    for (const cand of pool) {
      const r = this.analyze({ required: cand, available, context, fallbackPool: [] });
      if (r.compatible) return cand.id;
    }
    return undefined;
  }
}
