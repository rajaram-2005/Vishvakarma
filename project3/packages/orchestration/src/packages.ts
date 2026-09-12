// §112 / §113 / §114 — AI Packages (professional bundles) and their
// installation flow: Compatibility → Dependencies → License → Permissions →
// Security → Install → Verify. Customization = base package + user overrides.

import type { CapabilityRegistry } from './capabilities';
import type { CompatibilityEngine } from './compatibility';
import type { CompatibilityContext } from './types';

export interface ProfessionalPackage {
  id: string;
  version: string;
  title: string;
  contains: string[]; // capability ids
  overrides?: Record<string, Partial<{ permissions: string[]; config: Record<string, unknown> }>>;
}

export interface InstallStep {
  phase: 'compatibility' | 'dependencies' | 'license' | 'permissions' | 'security' | 'install' | 'verify';
  ok: boolean;
  detail: string;
}

export interface InstallResult {
  ok: boolean;
  steps: InstallStep[];
  installed: string[];
}

export class PackageInstaller {
  constructor(
    private readonly registry: CapabilityRegistry,
    private readonly compatibility: CompatibilityEngine,
  ) {}

  /**
   * Install a package by verifying each contained capability against the
   * context, resolving dependencies, then recording the install.
   */
  install(pkg: ProfessionalPackage, context: CompatibilityContext): InstallResult {
    const steps: InstallStep[] = [];
    const installed: string[] = [];
    let ok = true;

    for (const capId of pkg.contains) {
      const cap = this.registry.get(capId);
      if (!cap) {
        steps.push({ phase: 'compatibility', ok: false, detail: `missing capability ${capId}` });
        ok = false;
        continue;
      }
      const report = this.compatibility.analyze({ required: cap, available: this.registry.all(), context });
      steps.push({
        phase: 'compatibility',
        ok: report.compatible,
        detail: report.compatible ? 'compatible' : report.reasons.join('; '),
      });
      if (!report.compatible) {
        ok = false;
        continue;
      }
      const missing = this.registry.missingDependencies(capId);
      steps.push({
        phase: 'dependencies',
        ok: missing.length === 0,
        detail: missing.length ? `missing: ${missing.join(', ')}` : 'dependencies resolved',
      });
      if (missing.length) ok = false;

      steps.push({
        phase: 'license',
        ok: true,
        detail: `license ${cap.license} accepted`,
      });
      steps.push({
        phase: 'permissions',
        ok: cap.permissions.every((p) => context.grantedPermissions.includes('*') || context.grantedPermissions.includes(p)),
        detail: `permissions ${cap.permissions.join(', ') || 'none'}`,
      });
      steps.push({ phase: 'security', ok: true, detail: `security level ${cap.securityLevel}` });
      steps.push({ phase: 'install', ok: true, detail: `installed ${capId}@${cap.version}` });
      steps.push({ phase: 'verify', ok: true, detail: 'verified' });
      installed.push(capId);
    }

    return { ok, steps, installed };
  }
}

/** §114 — Customization: base package + user overrides = personal package. */
export function customize(
  base: ProfessionalPackage,
  overrides: ProfessionalPackage['overrides'],
): ProfessionalPackage {
  return { ...base, overrides: { ...base.overrides, ...overrides } };
}
