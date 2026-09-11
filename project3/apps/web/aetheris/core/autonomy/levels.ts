/**
 * Autonomy Levels — 6 levels (L0..L5) from the Aetheris vision.
 *
 *   L0 REPORTING_ONLY   — Aetheris may observe, plan, and report.
 *                          It never modifies state.
 *   L1 ADVISE           — Aetheris may also suggest specific
 *                          intervention steps; user must accept.
 *   L2 GATED_WRITE      — Aetheris may run planAndGate for software-
 *                          side interventions; safety gate decides.
 *   L3 SUPERVISED_WRITE — same as L2 but the plan is also committed
 *                          and the system logs a remediation record.
 *   L4 AUTONOMOUS_WRITE — Aetheris may commit intervention plans
 *                          without prompting, but every action is
 *                          auditable; a human can revoke.
 *   L5 AUTONOMOUS_ACCEPT — Aetheris may also accept predicted
 *                          outcomes; no human review for low-risk
 *                          steps.
 *
 *   In the current build, the actual policy gate (planAndGate)
 *   still has the final say — autonomy levels are advisory in
 *   this code line. The page exposes the level the user is
 *   currently operating at and lets them request a change.
 */

import { store } from "@/aetheris/lib/store";

export type AutonomyLevel = 0 | 1 | 2 | 3 | 4 | 5;

export const AUTONOMY_LEVELS: { level: AutonomyLevel; name: string; description: string; capability: string[] }[] = [
  { level: 0, name: "REPORTING_ONLY", description: "Observe, plan, report. Never modify state.", capability: ["plan", "report"] },
  { level: 1, name: "ADVISE", description: "Suggest specific intervention steps; user must accept.", capability: ["plan", "report", "advise"] },
  { level: 2, name: "GATED_WRITE", description: "Run planAndGate for software-side interventions; safety gate decides.", capability: ["plan", "report", "advise", "gated_write"] },
  { level: 3, name: "SUPERVISED_WRITE", description: "Same as L2 but the plan is also committed and the system logs a remediation record.", capability: ["plan", "report", "advise", "gated_write", "supervised_write"] },
  { level: 4, name: "AUTONOMOUS_WRITE", description: "Commit intervention plans without prompting; every action is auditable; a human can revoke.", capability: ["plan", "report", "advise", "gated_write", "supervised_write", "autonomous_write"] },
  { level: 5, name: "AUTONOMOUS_ACCEPT", description: "May also accept predicted outcomes; no human review for low-risk steps.", capability: ["plan", "report", "advise", "gated_write", "supervised_write", "autonomous_write", "autonomous_accept"] },
];

const COLLECTION = "user-config";

export interface AutonomyConfig {
  uid: string;
  level: AutonomyLevel;
  updatedAt: number;
  /** A human-readable note from the change request, if any. */
  note: string;
}

export async function getAutonomyLevel(uid: string): Promise<AutonomyConfig> {
  const existing = await store.get<AutonomyConfig>(COLLECTION, `autonomy:${uid}`);
  if (existing) return existing;
  return { uid, level: 1, updatedAt: 0, note: "default (never explicitly set)" };
}

export async function setAutonomyLevel(uid: string, level: AutonomyLevel, note: string): Promise<AutonomyConfig> {
  if (!AUTONOMY_LEVELS.some((l) => l.level === level)) {
    throw new Error(`Invalid autonomy level: ${level}`);
  }
  const cfg: AutonomyConfig = { uid, level, updatedAt: Date.now(), note: note.slice(0, 200) };
  await store.set(COLLECTION, `autonomy:${uid}`, cfg);
  return cfg;
}

export function levelName(level: AutonomyLevel): string {
  return AUTONOMY_LEVELS.find((l) => l.level === level)?.name ?? `L${level}`;
}

export function can(level: AutonomyLevel, capability: string): boolean {
  const def = AUTONOMY_LEVELS.find((l) => l.level === level);
  return !!def?.capability.includes(capability);
}
