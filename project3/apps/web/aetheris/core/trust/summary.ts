/**
 * Trust / Permissions summary.
 *
 *   A pure read-side helper that answers: what is the current
 *   principal allowed to do, and what are they not allowed to do?
 *   It composes the existing permissions module with the
 *   capability registry so the answer is grounded in real
 *   declarations.
 *
 *   The page exposes a 5-level ladder (read_only, safe_write,
 *   full_workspace, admin, physical), a per-capability allow/deny
 *   list, and the highest level the principal currently has.
 */

import { allCapabilities } from "@/aetheris/core/capabilities/registry";
import { bootCapabilities } from "@/aetheris/core/capabilities/sources";
import { DEFAULT_GRANTS, highestLevel, hasLevel, type PermissionLevel, type Principal } from "@/aetheris/core/policy/permissions";
export type { PermissionLevel };

export const LEVELS: { level: PermissionLevel; name: string; description: string; needsConfirmation: boolean }[] = [
  { level: "read_only", name: "Read-only", description: "Read files, fetch knowledge, run diagnostics, view twins. No state changes.", needsConfirmation: false },
  { level: "safe_write", name: "Safe write", description: "Send chat messages, write into the user's own workspace, schedule automations. Reversible.", needsConfirmation: false },
  { level: "full_workspace", name: "Full workspace", description: "Run code in the sandbox, deploy lab artifacts, schedule long-running jobs. Needs a one-time confirmation token.", needsConfirmation: true },
  { level: "admin", name: "Admin", description: "Manage users, plans, providers, and global settings. Never implied; must be granted explicitly.", needsConfirmation: true },
  { level: "physical", name: "Physical", description: "Send commands to real hardware (devices, robots, actuators). Off by default. Must be granted explicitly and never implied.", needsConfirmation: true },
];

export interface CapabilityPermissionRow {
  id: string;
  name: string;
  status: string;
  required: PermissionLevel;
  allowed: boolean;
  reason: string;
}

export interface TrustSummary {
  uid: string;
  principal: Principal;
  highestLevel: PermissionLevel;
  isDefaultPrincipal: boolean;
  capabilitiesAllowed: number;
  capabilitiesDenied: number;
  totalCapabilities: number;
  byLevel: Record<PermissionLevel, { allowed: number; total: number }>;
  rows: CapabilityPermissionRow[];
  recentConfirmations: number;
}

function principalFor(uid: string): { principal: Principal; isDefault: boolean } {
  // In this build the principal is reconstructed from
  // DEFAULT_GRANTS; the user-config:autonomy: collection holds the
  // autonomy level (a separate axis). The permissions themselves
  // are the same for every user in the default build.
  return { principal: { uid, grants: [...DEFAULT_GRANTS] }, isDefault: true };
}

export async function trustSummary(uid: string, opts: { recentConfirmations?: number } = {}): Promise<TrustSummary> {
  bootCapabilities();
  const { principal, isDefault } = principalFor(uid);
  const caps = await allCapabilities();
  const byLevel: Record<PermissionLevel, { allowed: number; total: number }> = {
    read_only: { allowed: 0, total: 0 },
    safe_write: { allowed: 0, total: 0 },
    full_workspace: { allowed: 0, total: 0 },
    admin: { allowed: 0, total: 0 },
    physical: { allowed: 0, total: 0 },
  };
  const rows: CapabilityPermissionRow[] = caps.map((c) => {
    const required = (c.security_level ?? "read_only") as PermissionLevel;
    const allowed = hasLevel(principal, required) && !(principal.deny?.includes(c.id) ?? false);
    const reason = allowed
      ? `granted via ${highestLevel(principal.grants)}`
      : principal.deny?.includes(c.id)
        ? `deny list contains ${c.id}`
        : `requires ${required}, principal has ${highestLevel(principal.grants)}`;
    byLevel[required].total++;
    if (allowed) byLevel[required].allowed++;
    return { id: c.id, name: c.name, status: c.status, required, allowed, reason };
  });
  return {
    uid,
    principal,
    highestLevel: highestLevel(principal.grants),
    isDefaultPrincipal: isDefault,
    capabilitiesAllowed: rows.filter((r) => r.allowed).length,
    capabilitiesDenied: rows.filter((r) => !r.allowed).length,
    totalCapabilities: rows.length,
    byLevel,
    rows,
    recentConfirmations: opts.recentConfirmations ?? 0,
  };
}
