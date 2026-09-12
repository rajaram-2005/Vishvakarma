// §79 / §80 / §81 / §82 — Multi-agent internal execution roles and autonomy
// levels for Coder / Studio / Research. High-risk operations stay policy-controlled.

export type Surface = 'coder' | 'studio' | 'research' | 'chat';
export type AutonomyLevel = 'assist' | 'semi-autonomous' | 'autonomous';

export interface AutonomyProfile {
  level: AutonomyLevel;
  /** Permissions the surface may exercise without explicit confirmation. */
  autoPermissions: string[];
  /** Operations that always require a human/approval regardless of level. */
  alwaysGated: string[];
}

const HIGH_RISK = ['terminal.exec', 'deploy', 'git.push', 'delete', 'payment'];

export function autonomyProfile(surface: Surface, level: AutonomyLevel): AutonomyProfile {
  const base = level === 'assist' ? [] : level === 'semi-autonomous' ? ['fs.read', 'network.request'] : ['fs.read', 'fs.write', 'network.request'];
  return {
    level,
    autoPermissions: base,
    alwaysGated: HIGH_RISK,
  };
}

/** §80 — Coder autonomy: can the agent execute this operation at this level? */
export function mayExecute(profile: AutonomyProfile, permission: string): boolean {
  if (profile.alwaysGated.includes(permission)) return false;
  return profile.autoPermissions.includes(permission) || profile.autoPermissions.includes('*');
}

/** §79 — Internal orchestration roles (not exposed as products). */
export type AgentRole = 'planner' | 'researcher' | 'coder' | 'tester' | 'reviewer' | 'security' | 'publisher';

export const INTERNAL_AGENTS: AgentRole[] = ['planner', 'researcher', 'coder', 'tester', 'reviewer', 'security', 'publisher'];

export function rolePrompt(role: AgentRole): string {
  const map: Record<AgentRole, string> = {
    planner: 'Decompose the request into a safe task graph.',
    researcher: 'Gather and cite evidence from allowed sources.',
    coder: 'Implement the change with tests.',
    tester: 'Verify behaviour and report failures.',
    reviewer: 'Review for quality, security and correctness.',
    security: 'Scan for risks and data-policy violations.',
    publisher: 'Prepare the artifact for release.',
  };
  return map[role];
}
