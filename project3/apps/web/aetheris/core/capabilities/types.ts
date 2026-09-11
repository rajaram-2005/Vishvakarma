/**
 * Aetheris Core — Capability model.
 *
 * Every model, agent, tool, connector, workflow, data source, device adapter and service in
 * Aetheris is described by one `Capability` record. The registry (./registry.ts) is the single
 * place the router, planner, permission layer, Control Center and docs read from.
 *
 * Design rules:
 *  • Adding a capability never requires touching Aetheris Core — sources register themselves.
 *  • Status is mandatory and honest: nothing is presented as working unless it is.
 *  • Permissions are capability-based (see ../policy).
 */

/** Honest implementation status (mandatory). */
export type CapabilityStatus = "implemented" | "partial" | "experimental" | "mocked" | "not_available";

export type CapabilityCategory =
  | "model" | "agent" | "tool" | "connector" | "knowledge" | "memory" | "research" | "code" | "github"
  | "browser" | "media" | "workflow" | "automation" | "device" | "robot" | "twin" | "industrial" | "storage" | "search" | "execution" | "auth" | "system";

/** Which execution permission a capability needs (mirrors ../policy/permissions.ts). */
export type SecurityLevel = "read_only" | "safe_write" | "full_workspace" | "admin" | "physical";

export interface JsonSchema { type?: string; properties?: Record<string, unknown>; required?: string[]; description?: string; [k: string]: unknown }

export interface Capability {
  /** Globally unique, namespaced: "model:groq", "agent:coder", "connector:github", "device:esp32-serial" */
  id: string;
  name: string;
  category: CapabilityCategory;
  description: string;
  /** Where the capability is provided from (module/adaptor id) so it can be replaced. */
  provider: string;
  status: CapabilityStatus;
  /** Free-text tags used by intent matching ("coding", "tamil", "pdf", "mqtt"). */
  tags: string[];
  input_schema?: JsonSchema;
  output_schema?: JsonSchema;
  /** Minimum permission level required to invoke. */
  security_level: SecurityLevel;
  /** Whether a human confirmation is required before invocation (high-impact actions). */
  requires_confirmation?: boolean;
  cost: { unit: "free" | "credits" | "usd"; estimate?: number };
  /** Typical latency class. */
  latency: "instant" | "fast" | "normal" | "slow" | "background";
  /** 0–1 from health telemetry when known. */
  reliability?: number;
  hardware_requirements?: string[];
  model_requirements?: { vision?: boolean; tools?: boolean; minContext?: number };
  supported_operations: string[];
  dependencies?: string[];
  verification_status: "verified" | "unverified" | "untestable_here";
  /** Local/remote/hybrid execution locality (offline-first). */
  locality: "local" | "remote" | "hybrid";
  /** How to invoke: informational for the planner/UI. */
  invoke?: { kind: "http" | "internal" | "mcp" | "chat_command" | "mention"; ref: string };
}

export type CapabilityQuery = { q?: string; category?: CapabilityCategory | CapabilityCategory[]; status?: CapabilityStatus[]; tags?: string[]; maxSecurity?: SecurityLevel; limit?: number };

/** A source that contributes capabilities (models, agents, MCP catalog, …). */
export interface CapabilitySource { id: string; list(): Promise<Capability[]> | Capability[] }

export const SECURITY_RANK: Record<SecurityLevel, number> = { read_only: 0, safe_write: 1, full_workspace: 2, admin: 3, physical: 4 };
