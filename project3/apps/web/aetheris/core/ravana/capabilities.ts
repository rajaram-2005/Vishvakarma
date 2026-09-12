/**
 * RAVANA capability source — the platform's capability registry stays the single discovery
 * surface; RAVANA registers its subsystems and tools there like every other provider does.
 */
import type { Capability, CapabilitySource } from "../capabilities/types";
import { registerSource } from "../capabilities/registry";
import { toolStatus } from "./tools";

export function ravanaList(): Capability[] {
  const base = {
    provider: "ravana",
    category: "system" as const,
    cost: { unit: "free" as const },
    latency: "background" as const,
    verification_status: "verified" as const,
    locality: "hybrid" as const,
  };
  return [
    {
      ...base,
      id: "ravana:engine",
      name: "RAVANA — Aetheris Core #1 (Reasoning)",
      category: "agent",
      description: "Reasoning core: intent classification, DAG planning, role-based model routing (fast/reasoning/coding/vision over the Aetheris mesh), tool policy + sandbox, agent loop with per-node verification and plan-level recovery, layered memory (working/session/episodic/semantic), execution-trace streaming. /api/v1/ravana.",
      status: "implemented",
      tags: ["ravana", "reasoning", "agent", "planning", "verification", "router"],
      security_level: "read_only",
      latency: "background",
      supported_operations: ["chat", "tasks", "plan", "run", "stream", "verify", "memory"],
      invoke: { kind: "internal", ref: "/api/v1/ravana" },
    },
    {
      ...base,
      id: "ravana:planner",
      name: "RAVANA planning engine (DAG task graphs)",
      category: "agent",
      description: "Converts objectives into dependency graphs of typed tasks (understand/research/reason/code) with priorities, tools and verification; model-drafted on deep goals, canonical templates otherwise; cycle-safe normalization.",
      status: "implemented",
      tags: ["ravana", "planning", "dag"],
      security_level: "read_only",
      latency: "fast",
      supported_operations: ["build-plan"],
      invoke: { kind: "internal", ref: "planner.buildPlan" },
    },
    {
      ...base,
      id: "ravana:router",
      name: "RAVANA model router (roles over the mesh)",
      category: "model",
      description: "Selects provider candidates per role (fast/reasoning/coding/vision) with locality policy, per-role env overrides (RAVANA_MODEL_<ROLE>) and independent-reviewer avoidance. GET /api/v1/ravana/models.",
      status: "implemented",
      tags: ["ravana", "router", "models"],
      security_level: "read_only",
      latency: "instant",
      supported_operations: ["select", "pool"],
      invoke: { kind: "internal", ref: "/api/v1/ravana/models" },
    },
    {
      ...base,
      id: "ravana:verifier",
      name: "RAVANA verifier (tests · structural · selfcheck · independent review)",
      category: "system",
      description: "Mandatory verification: code steps execute in the sandbox before passing; final deliverables get same-role self-checks or independent review routed away from the generator; findings feed the fix loop.",
      status: "implemented",
      tags: ["ravana", "verification", "review"],
      security_level: "read_only",
      latency: "normal",
      supported_operations: ["check-node", "check-final"],
      invoke: { kind: "internal", ref: "verification.verifier" },
    },
    {
      ...base,
      id: "ravana:memory",
      name: "RAVANA memory hierarchy",
      category: "memory",
      description: "Working + session memory in-process (destroyed with the task); episodic + semantic memory persisted per project; layered retrieval pipeline with metadata filtering, deterministic rerank and context compression. POST /api/v1/ravana/memory/search.",
      status: "implemented",
      tags: ["ravana", "memory", "retrieval", "episodic", "semantic"],
      security_level: "read_only",
      latency: "fast",
      supported_operations: ["save", "search", "list", "delete"],
      invoke: { kind: "internal", ref: "/api/v1/ravana/memory/search" },
    },
    {
      ...base,
      id: "ravana:tool-policy",
      name: "RAVANA tool policy (capability + confirmation gates)",
      category: "tool",
      description: "Every RAVANA tool call goes LLM → request → policy engine → permission check → sandbox → result. Denied by default: paths outside the per-user workspace, unrestricted shell, sudo, network. Confirmation-gated tools pause the task until a single-use token approves them. GET /api/v1/ravana/tools.",
      status: "implemented",
      tags: ["ravana", "tools", "policy", "sandbox", "permissions"],
      security_level: "read_only",
      latency: "fast",
      supported_operations: ["list", "request", "confirm", "deny"],
      invoke: { kind: "internal", ref: "/api/v1/ravana/tools" },
    },
    {
      ...base,
      id: "ravana:tools",
      name: "RAVANA built-in tools",
      category: "tool",
      description: "Unified tool protocol catalog: memory.search, web.search (Tavily, status-dependent), python.execute + shell.execute (isolated sandbox), filesystem.read/write (per-user RAVANA workspace only).",
      status: "implemented",
      tags: ["ravana", "tools", "sandbox"],
      security_level: "read_only",
      latency: "fast",
      supported_operations: toolStatus().map((t) => t.name),
      invoke: { kind: "internal", ref: "/api/v1/ravana/tools" },
    },
    {
      ...base,
      id: "ravana:episodes",
      name: "RAVANA Episode Ledger",
      category: "system",
      description: "Read-side ledger of finished RAVANA tasks (completed/failed/cancelled/timeout). Projects plan, execution-trace events, verification, models/tools and duration into list + detail + JSON/CSV export. Live tasks excluded. Does not invent accuracy or training labels — seed surface for a future RAVANA-Bench, not a benchmark itself. GET /api/v1/ravana/episodes, /episodes.",
      status: "implemented",
      tags: ["ravana", "episodes", "audit", "export", "trace"],
      security_level: "read_only",
      latency: "fast",
      supported_operations: ["list", "get", "export"],
      locality: "local",
      invoke: { kind: "internal", ref: "/api/v1/ravana/episodes" },
    },
  ];
}

export const ravanaSource: CapabilitySource = {
  id: "ravana",
  list: ravanaList,
};

registerSource(ravanaSource);
