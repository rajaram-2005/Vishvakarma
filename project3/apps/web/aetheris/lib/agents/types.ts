/**
 * Aetheris agent hierarchy.
 *
 *   ultra  — Aetheris Prime: understands the request, plans, delegates, synthesises.
 *   god    — Hermes (execution + tool-calling base) and Metis (meta-learning / reflection).
 *   sub    — domain specialists. Every sub-agent inherits the Hermes base behaviour.
 */
export type AgentTier = "ultra" | "god" | "sub";

export type AgentDomain =
  | "core" | "academy" | "coding" | "research" | "writing" | "business" | "marketing" | "finance"
  | "legal" | "health" | "design" | "data" | "career" | "language" | "productivity" | "science" | "creative" | "ethics";

export interface AgentSpec {
  id: string;
  name: string;
  icon: string;
  tier: AgentTier;
  domain: AgentDomain;
  /** One line shown in the picker / catalog. */
  description: string;
  /** Specialist instructions (appended to the Hermes base). */
  system: string;
  /** Short list of things this agent is good at — used by the planner for routing. */
  skills: string[];
  /** Capabilities the orchestrator may grant. */
  tools?: ("web" | "mcp")[];
  temperature?: number;
  /** Extra @mention aliases (the id is always an alias). */
  aliases?: string[];
}

export interface AgentPlan {
  /** Ordered sub-agent ids. */
  agents: string[];
  /** "single" → one agent answers; "pipeline" → each builds on the previous; "parallel" → run all then synthesise. */
  mode: "single" | "pipeline" | "parallel";
  /** Short rationale shown in the UI. */
  reason: string;
  /** Per-agent task briefs (same length as agents). */
  briefs: string[];
}

export interface Lesson {
  agent: string;
  text: string;
  at: number;
}

export type AgentEvent =
  | { type: "plan"; plan: AgentPlan; provider?: string }
  | { type: "agent_start"; agent: string; brief: string; index: number }
  | { type: "agent_delta"; agent: string; text: string }
  | { type: "agent_done"; agent: string; provider: string; model: string; latencyMs: number; chars: number }
  | { type: "agent_error"; agent: string; error: string }
  | { type: "tool"; agent: string; event: unknown }
  | { type: "synthesis"; provider?: string }
  | { type: "delta"; text: string }
  | { type: "lessons"; lessons: Lesson[] }
  | { type: "done"; agents: string[]; provider: string; model: string; latencyMs: number; mode: AgentPlan["mode"] }
  | { type: "error"; error: string };
