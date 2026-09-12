// Unified AI Studio — Orchestration Core domain types.
//
// This module is the shared vocabulary for the "ONE CORE" described in the
// product spec §121. Every surface (Chat, Studio, Coder, Library, Plugins,
// MCP, Schedules, Models, Workflows) is built ON TOP of these primitives
// rather than as independent applications.

import type { ModelInfo, Span, Trace, RiskLevel } from '@sutra/shared';

export type { ModelInfo, Span, Trace, RiskLevel };

/* ------------------------------------------------------------------ */
/* §2 / §4 — Capability Graph & Capability Contracts                    */
/* ------------------------------------------------------------------ */

export type CapabilityType =
  | 'model'
  | 'bot'
  | 'plugin'
  | 'mcp'
  | 'tool'
  | 'skill'
  | 'workflow'
  | 'schedule'
  | 'file'
  | 'knowledge'
  | 'project'
  | 'coder'
  | 'studio-tool'
  | 'professional-package'
  | 'integration';

export type RuntimeKind = 'cloud' | 'local' | 'hybrid' | 'edge';
export type NetworkRequirement = 'none' | 'optional' | 'required';
export type SecurityLevel = 'public' | 'internal' | 'restricted' | 'confidential';
export type Availability = 'stable' | 'beta' | 'experimental' | 'deprecated';

/**
 * A machine-readable contract (§4). Every model, plugin, MCP server, tool and
 * workflow declares one of these so the platform can compose capabilities
 * automatically and reject incompatible combinations (§3).
 */
export interface CapabilityContract {
  id: string;
  version: string;
  type: CapabilityType;
  provider: string;
  /** What this capability can do, in free-form tags. */
  capabilities: string[];
  /** Data/modality types it accepts. */
  inputs: string[];
  /** Data/modality types it produces. */
  outputs: string[];
  /** Other capability ids (optionally `id@version`) this depends on. */
  dependencies: string[];
  /** Permission scopes required to invoke it. */
  permissions: string[];
  /** E.g. 'text-to-image', 'image-to-image', 'speech-to-text'. */
  modalities: string[];
  runtime: RuntimeKind;
  /** Hardware it needs, e.g. 'gpu', 'cpu', 'npu'. 'cpu' is always assumed. */
  hardware: string[];
  network: NetworkRequirement;
  /** SPDX license id. */
  license: string;
  securityLevel: SecurityLevel;
  availability: Availability;
  /** Explicit compatibility constraints (ids this is known to work with). */
  compatibleWith?: string[];
  /** Optional richer signals used by the router / fallback. */
  costTier?: 'free' | 'low' | 'medium' | 'high';
  /** 'local-only' capabilities never touch the cloud. */
  privacy?: 'local-only' | 'cloud-ok';
  /** Subjective 0..1 quality signal (benchmarks, reviews). */
  qualityScore?: number;
}

/* ------------------------------------------------------------------ */
/* §3 — Compatibility Engine                                           */
/* ------------------------------------------------------------------ */

export type CompatibilityCheckName =
  | 'dependency'
  | 'input'
  | 'output'
  | 'permission'
  | 'runtime'
  | 'hardware'
  | 'network'
  | 'license'
  | 'policy'
  | 'model'
  | 'plugin'
  | 'mcp';

export interface CompatibilityCheck {
  name: CompatibilityCheckName;
  ok: boolean;
  detail: string;
}

export interface CompatibilityContext {
  /** No network available right now. */
  offline: boolean;
  privacyMode: 'local' | 'cloud' | 'hybrid';
  /** Permission scopes the caller holds ('*' = everything). */
  grantedPermissions: string[];
  /** Hardware the host actually has available. */
  availableHardware?: string[];
  /** If set, only these licenses are permitted. */
  allowedLicenses?: string[];
  /** Licenses explicitly disallowed (e.g. non-commercial for an org). */
  blockedLicenses?: string[];
  /** If true, deprecated capabilities are rejected outright. */
  rejectDeprecated?: boolean;
}

export interface CompatibilityReport {
  compatible: boolean;
  checks: CompatibilityCheck[];
  reasons: string[];
  /** Suggested replacement capability id if `compatible` is false. */
  fallbackId?: string;
}

export interface CompatibilityRequest {
  required: CapabilityContract;
  /** Other capabilities available for composition. */
  available: CapabilityContract[];
  context: CompatibilityContext;
  /** Candidates to try as a fallback if `required` is incompatible. */
  fallbackPool?: CapabilityContract[];
}

/* ------------------------------------------------------------------ */
/* §5 / §6 — Universal Task Graph                                      */
/* ------------------------------------------------------------------ */

export type TaskStatus =
  | 'pending'
  | 'queued'
  | 'planning'
  | 'running'
  | 'waiting_for_input'
  | 'waiting_for_permission'
  | 'waiting_for_tool'
  | 'verifying'
  | 'completed'
  | 'failed'
  | 'skipped'
  | 'cancelled';

/** A single node in a task graph (§5). */
export interface TaskNode {
  id: string;
  name: string;
  /** Logical grouping, e.g. 'Research', 'Writing', 'Studio'. */
  group?: string;
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  dependsOn: string[];
  model?: string;
  tools: string[];
  permissions: string[];
  status: TaskStatus;
  retries: number;
  maxRetries: number;
  result?: unknown;
  evidence?: unknown[];
  error?: string;
}

export interface TaskGraph {
  id: string;
  /** The originating user request / intent. */
  root: string;
  nodes: Record<string, TaskNode>;
}

/* ------------------------------------------------------------------ */
/* §7 / §8 — State Machine & Resumable Tasks                           */
/* ------------------------------------------------------------------ */

export type FlowState =
  | 'QUEUED'
  | 'PLANNING'
  | 'WAITING_FOR_INPUT'
  | 'WAITING_FOR_PERMISSION'
  | 'RUNNING'
  | 'WAITING_FOR_TOOL'
  | 'VERIFYING'
  | 'COMPLETED'
  | 'FAILED'
  | 'RETRYING'
  | 'RECOVERING'
  | 'CANCELLED';

export interface StateTransition {
  from: FlowState;
  to: FlowState;
  at: number;
  note?: string;
}

export interface Checkpoint {
  id: string;
  label: string;
  completed: boolean;
  ts?: string;
}

/* ------------------------------------------------------------------ */
/* §45 — Event Bus                                                     */
/* ------------------------------------------------------------------ */

export interface DomainEventMap {
  'file.uploaded': { fileId: string; name: string };
  'model.installed': { modelId: string };
  'chat.completed': { conversationId: string; model: string };
  'coder.completed': { projectId: string };
  'studio.generated': { assetId: string };
  'schedule.started': { scheduleId: string };
  'workflow.failed': { workflowId: string; nodeId?: string };
  'plugin.updated': { pluginId: string };
  'security.alert': { risk: RiskLevel; detail: string };
  'deployment.completed': { deploymentId: string };
  'task.completed': { taskId: string };
  'task.failed': { taskId: string; error: string };
  'capability.registered': { capabilityId: string };
  'capability.removed': { capabilityId: string };
  'provider.health': { modelId: string; status: string };
  [key: string]: Record<string, unknown>;
}

export type EventName = keyof DomainEventMap;

/* ------------------------------------------------------------------ */
/* §9 / §10 / §11 — Model Router, Fallback & Health                    */
/* ------------------------------------------------------------------ */

export type RoutingMode =
  | 'auto'
  | 'quality'
  | 'fast'
  | 'cheap'
  | 'private'
  | 'local'
  | 'balanced'
  | 'custom';

export type HealthStatus =
  | 'healthy'
  | 'degraded'
  | 'unavailable'
  | 'rate-limited'
  | 'auth-required';

export interface RoutingContext {
  offline?: boolean;
  privacyMode?: 'local' | 'cloud' | 'hybrid';
  text?: string;
  /** For 'custom' mode: ordered priority dimensions. */
  priorities?: Array<'capability' | 'quality' | 'cost' | 'latency' | 'privacy' | 'availability'>;
}

export interface RunOptions {
  context?: CompatibilityContext;
  /** Maximum total node attempts before the run is aborted. */
  maxAttempts?: number;
  /** If an executor throws NeedsPermissionError, pause instead of failing. */
  pauseForPermission?: boolean;
}

export interface RunResult {
  graph: TaskGraph;
  completed: string[];
  failed: string[];
  paused?: string;
  trace: Trace;
}

/** Thrown by an executor to pause a task in WAITING_FOR_PERMISSION. */
export class NeedsPermissionError extends Error {
  constructor(
    message: string,
    public readonly permission: string,
    public readonly risk: RiskLevel = 'high',
  ) {
    super(message);
    this.name = 'NeedsPermissionError';
  }
}

/** Implemented by callers: performs the actual work for one task node. */
export interface NodeExecutor {
  execute(node: TaskNode, ctx: { context?: CompatibilityContext }): Promise<{
    result?: unknown;
    evidence?: unknown[];
  }>;
}
