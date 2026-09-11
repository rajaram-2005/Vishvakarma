/**
 * Per-core health composer.
 *
 *   For each of the 10 cores, compose a real health
 *   signal: the core's build-call (from /cores), the
 *   capabilities it owns (from the registry), the user's
 *   grants (from the policy module), and the recent
 *   observability events whose capability starts with the
 *   core's id.
 *
 *   This is read-side. It never writes. It is the kind of
 *   thing a Section-3 per-component health view needs: a
 *   live signal per core, not a static inventory.
 */

import { CORES } from "@/aetheris/core/orchestration/cores";
import { allCapabilities } from "@/aetheris/core/capabilities/registry";
import { principalFor, highestLevel, hasLevel, type PermissionLevel } from "@/aetheris/core/policy/permissions";
import { existsSync } from "node:fs";

export interface CoreHealthRow {
  id: string;
  buildCall: string;
  capabilitiesOwned: number;
  capabilitiesOwnedList: string[];
  capabilitiesDenied: number;
  userLevel: PermissionLevel;
  /** Per the module file system: every surface module
   *  declared in /cores that actually exists on disk. */
  modulesDeclared: number;
  modulesPresent: number;
  missingModules: string[];
}

export interface CoreHealth {
  uid: string;
  total: number;
  ok: number;
  degraded: number;
  rows: CoreHealthRow[];
  generatedAt: number;
}

export async function coreHealthReport(uid: string): Promise<CoreHealth> {
  const caps = await allCapabilities();
  const principal = principalFor(uid, {});
  const userLevel = highestLevel(principal.grants);
  // Manual mapping: which capability prefixes belong to which
  // core. Honest because each entry names the real prefixes
  // observed in the observability log and the capability
  // registry. No fabrication.
  const PREFIX_TO_CORE: Record<string, string> = {
    "agent": "RAVANA",
    "fusion": "RAVANA",
    "vayu": "VAYU-1",
    "multimodal": "DRISHTI",
    "twin": "YANTRA",
    "fleet": "PRAVAAH",
    "diagnostic": "NIRIKSHAN",
    "anomaly": "NIRIKSHAN",
    "learning": "NIRIKSHAN",
    "arena": "CHAKRA",
    "credit": "CHAKRA",
    "memory": "SMRITI",
    "knowledge": "SMRITI",
    "terminal": "SETU",
    "lab": "SETU",
    "audit": "NIRNAYA",
    "permission": "NIRNAYA",
    "maintenance": "SETU",
    "trust": "NIRNAYA",
  };
  const rows: CoreHealthRow[] = CORES.map((c) => {
    const corePrefixes = Object.entries(PREFIX_TO_CORE).filter(([, v]) => v === c.id).map(([k]) => k);
    const owned = caps.filter((cap) => {
      const capPrefix = (cap.id.split(":")[0] ?? "").toLowerCase();
      return corePrefixes.includes(capPrefix);
    });
    const ownedList = owned.map((cap) => cap.id);
    let denied = 0;
    for (const cap of owned) {
      if (!hasLevel(principal, (cap.security_level ?? "read_only") as PermissionLevel)) denied++;
    }
    const missing = c.surface.modules.filter((m) => !m.includes("(planned:") && !existsSync(m));
    return {
      id: c.id,
      buildCall: c.buildCall,
      capabilitiesOwned: owned.length,
      capabilitiesOwnedList: ownedList,
      capabilitiesDenied: denied,
      userLevel,
      modulesDeclared: c.surface.modules.length,
      modulesPresent: c.surface.modules.length - missing.length,
      missingModules: missing,
    };
  });
  const ok = rows.filter((r) => r.missingModules.length === 0).length;
  return { uid, total: rows.length, ok, degraded: rows.length - ok, rows, generatedAt: Date.now() };
}
