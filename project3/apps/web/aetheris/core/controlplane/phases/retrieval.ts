/**
 * Phase 3 — Evidence & Memory Retrieval
 *
 * Collects an EvidenceBundle:
 * ├── telemetry
 * ├── historical
 * ├── semantic
 * ├── visual
 * ├── procedural
 * └── external
 *
 * Every item receives: source, timestamp, relevance, reliability, freshness, provenance.
 * Gate:
 *   SUFFICIENT -> continue
 *   INSUFFICIENT -> retrieve more / request data
 *   CONFLICTING -> enter conflict-resolution path
 */
import type { EvidenceBundle, EvidenceItem, GateVerdict } from "../types";
import type { TaskUnderstanding } from "./understanding";

export function runPhase3Retrieval(
  understanding: TaskUnderstanding,
  customItems?: EvidenceItem[]
): EvidenceBundle & { gateVerdict: GateVerdict; summary: string } {
  const items: EvidenceItem[] = customItems !== undefined ? [...customItems] : [];
  const now = Date.now();

  // If no custom items provided, synthesize seed evidence from known assets and query
  if (customItems === undefined) {
    // 1. Semantic memory item
    items.push({
      id: "ev-sem-001",
      category: "semantic",
      source: "SMRITI:knowledge_fabric",
      timestamp: now - 3600_000,
      relevance: 0.95,
      reliability: 0.9,
      freshness: 0.98,
      provenance: "Aetheris Knowledge Store / Spec Documents",
      content: `Context for query: ${understanding.objective}`,
      verified: true,
    });

    // 2. Asset & Telemetry evidence if assets exist
    for (const asset of understanding.assets) {
      if (asset !== "GENERAL_SYSTEM") {
        items.push({
          id: `ev-tel-${asset.toLowerCase()}`,
          category: "telemetry",
          source: `PRAVAAH:scada:${asset}`,
          timestamp: now - 60_000,
          relevance: 0.92,
          reliability: 0.95,
          freshness: 0.99,
          provenance: `SCADA Telemetry stream for ${asset}`,
          content: {
            asset,
            rotor_rpm: 1500,
            vib_bearing_mms: 8.4,
            gearbox_temp_K: 338.2,
            active_power_kW: 1850,
            status: "running",
          },
          verified: true,
        });

        items.push({
          id: `ev-hist-${asset.toLowerCase()}`,
          category: "historical",
          source: `SMRITI:incident_ledger:${asset}`,
          timestamp: now - 86400_000 * 7,
          relevance: 0.85,
          reliability: 0.88,
          freshness: 0.82,
          provenance: `Historical maintenance record for ${asset}`,
          content: `Prior maintenance on ${asset}: inner race bearing inspection conducted 7 days ago. Minor micro-pitting observed.`,
          verified: true,
        });

        items.push({
          id: `ev-proc-${asset.toLowerCase()}`,
          category: "procedural",
          source: "SMRITI:standard_operating_procedures",
          timestamp: now - 86400_000 * 30,
          relevance: 0.88,
          reliability: 0.99,
          freshness: 0.9,
          provenance: "ISO 10816 Vibration Severity Standards",
          content: "ISO 10816-3 Class III: Vibration > 7.1 mm/s is Warning, > 11.2 mm/s is Critical trip.",
          verified: true,
        });
      }
    }
  }

  // Detect conflicts
  const conflicts: Array<{ itemAId: string; itemBId: string; description: string }> = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i];
      const b = items[j];
      if (a.category === b.category && a.source === b.source && a.id !== b.id) {
        // Compare contents if both are string or object
        if (typeof a.content === "string" && typeof b.content === "string") {
          if (
            (a.content.includes("normal") && b.content.includes("fault")) ||
            (a.content.includes("running") && b.content.includes("tripped"))
          ) {
            conflicts.push({
              itemAId: a.id,
              itemBId: b.id,
              description: `Conflict between ${a.id} and ${b.id}: opposing status assertions.`,
            });
          }
        }
      }
    }
  }

  // Calculate overall evidence quality score (weighted average of relevance, reliability, freshness)
  let qualityScore = 0;
  if (items.length > 0) {
    const totalScore = items.reduce(
      (sum, it) => sum + (it.relevance * 0.4 + it.reliability * 0.4 + it.freshness * 0.2),
      0
    );
    qualityScore = totalScore / items.length;
  }

  const sufficient = items.length >= (understanding.assets[0] !== "GENERAL_SYSTEM" ? 3 : 1) && qualityScore >= 0.6;
  const isConflicting = conflicts.length > 0;

  let gateVerdict: GateVerdict = "PASS";
  let summary = `Evidence retrieval complete: ${items.length} items gathered with average quality score ${(qualityScore * 100).toFixed(1)}%.`;

  if (isConflicting) {
    gateVerdict = "LOOPBACK"; // needs conflict-resolution or review
    summary = `Evidence conflict detected between ${conflicts.length} pairs. Conflict resolution required.`;
  } else if (!sufficient) {
    gateVerdict = "FAIL";
    summary = `Insufficient evidence gathered (${items.length} items, quality: ${(qualityScore * 100).toFixed(1)}%). Need more data.`;
  }

  return {
    items,
    qualityScore,
    sufficient,
    conflicting: isConflicting,
    conflicts,
    gateVerdict,
    summary,
  };
}
