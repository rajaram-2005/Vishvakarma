/**
 * Capability Permission Matrix.
 *
 *   A read-side helper that turns the capability registry
 *   into a (category × security_level) matrix of counts. The
 *   matrix is the "permission grid" of Aetheris: which
 *   categories require which level, and how many capabilities
 *   live in each cell.
 *
 *   The matrix is honest: every cell is computed from the
 *   real registry, not from a hand-curated table. The page
 *   also returns a flat row list for the per-capability table.
 */

import { allCapabilities } from "@/aetheris/core/capabilities/registry";
import { bootCapabilities } from "@/aetheris/core/capabilities/sources";
import type { Capability, CapabilityCategory, SecurityLevel } from "@/aetheris/core/capabilities/types";

export const CATEGORIES: CapabilityCategory[] = [
  "model", "agent", "tool", "connector", "knowledge", "memory", "research", "code", "github",
  "browser", "media", "workflow", "automation", "device", "robot", "twin", "industrial", "storage", "search", "execution", "auth", "system",
];

export const LEVELS: SecurityLevel[] = ["read_only", "safe_write", "full_workspace", "admin", "physical"];

export interface PermissionMatrix {
  total: number;
  /** counts[category][level] = n capabilities in (cat, level). */
  counts: Record<CapabilityCategory, Record<SecurityLevel, number>>;
  /** Same matrix, normalised by category total. */
  fractions: Record<CapabilityCategory, Record<SecurityLevel, number>>;
  /** Category totals. */
  catTotals: Record<CapabilityCategory, number>;
  /** Level totals (capabilities per level). */
  levelTotals: Record<SecurityLevel, number>;
  /** All capabilities, sorted by (category, level, name). */
  rows: Capability[];
  generatedAt: number;
}

function zero<T extends string>(keys: T[]): Record<T, number> {
  const out = {} as Record<T, number>;
  for (const k of keys) out[k] = 0;
  return out;
}

export async function permissionMatrix(): Promise<PermissionMatrix> {
  bootCapabilities();
  const caps = await allCapabilities();
  const counts: Record<CapabilityCategory, Record<SecurityLevel, number>> = {} as Record<CapabilityCategory, Record<SecurityLevel, number>>;
  for (const c of CATEGORIES) counts[c] = zero(LEVELS);
  const catTotals: Record<CapabilityCategory, number> = zero(CATEGORIES);
  const levelTotals: Record<SecurityLevel, number> = zero(LEVELS);
  for (const cap of caps) {
    const cat = cap.category as CapabilityCategory;
    const lvl = (cap.security_level ?? "read_only") as SecurityLevel;
    if (!counts[cat]) counts[cat] = zero(LEVELS);
    counts[cat][lvl] = (counts[cat][lvl] ?? 0) + 1;
    catTotals[cat] = (catTotals[cat] ?? 0) + 1;
    levelTotals[lvl] = (levelTotals[lvl] ?? 0) + 1;
  }
  const fractions: Record<CapabilityCategory, Record<SecurityLevel, number>> = {} as Record<CapabilityCategory, Record<SecurityLevel, number>>;
  for (const c of CATEGORIES) {
    fractions[c] = zero(LEVELS);
    const total = catTotals[c] ?? 0;
    if (total > 0) {
      for (const l of LEVELS) fractions[c][l] = (counts[c][l] ?? 0) / total;
    }
  }
  const rows = [...caps].sort((a, b) => {
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    const la = SECURITY_RANK[(a.security_level ?? "read_only") as SecurityLevel];
    const lb = SECURITY_RANK[(b.security_level ?? "read_only") as SecurityLevel];
    if (la !== lb) return la - lb;
    return a.name.localeCompare(b.name);
  });
  return { total: caps.length, counts, fractions, catTotals, levelTotals, rows, generatedAt: Date.now() };
}

const SECURITY_RANK: Record<SecurityLevel, number> = { read_only: 0, safe_write: 1, full_workspace: 2, admin: 3, physical: 4 };
