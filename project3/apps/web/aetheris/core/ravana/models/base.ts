/**
 * RAVANA · Model abstraction (spec §2, §4, §18).
 *
 * RAVANA is an intelligence layer above models: the engine talks to `LlmLike`, never to a
 * concrete provider. Two bindings ship in v0.1:
 *   • mesh  — the Aetheris provider mesh (31 providers, local/remote) routed per role
 *   • preview — deterministic demo responder, clearly labelled, used when no provider is
 *     reachable (or forced for a keyless walkthrough). It performs NO model calls.
 *
 * The engine is testable against a fake `LlmLike`, and any future provider (Ollama/vLLM/llama.cpp
 * adapters from spec §18) only needs to implement this interface.
 */
import type { RavanaRole } from "../types";

export interface LlmRequest {
  role: RavanaRole;
  /** Role-level system prompt (RAVANA persona + honesty rules). */
  system: string;
  prompt: string;
  images?: string[];
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
  /** Providers/models to avoid (independent verification re-uses the mesh). */
  avoid?: string[];
}

export interface LlmResponse {
  content: string;
  provider: string;
  model: string;
}

/** One model-call contract. `engine` reports which binding answered (trace honesty). */
export interface LlmLike {
  readonly engine: "mesh" | "preview";
  complete(req: LlmRequest): Promise<LlmResponse>;
}

/** Role prompts — RAVANA's behavioural contract, identical across model bindings. */
export const ROLE_PROMPT: Record<RavanaRole, string> = {
  fast: "You are RAVANA, Aetheris's reasoning core, running on the fast model lane. Answer directly, accurately and briefly. If anything is uncertain, say so.",
  reasoning: "You are RAVANA, Aetheris's reasoning core. Reason carefully, show your working only where it serves the answer, and never invent facts or sources. If a claim needs evidence you do not have, say it needs verification.",
  coding: "You are RAVANA, Aetheris's coding core. Write clean, correct, tested code. Follow the exact output format requested. Never claim code runs unless it has been run or verified.",
  vision: "You are RAVANA, Aetheris's vision lane. Describe exactly what is in the image, reason about it when asked, and clearly separate what you can see from what you infer.",
};

/** System scaffolding appended to planning/verification calls. */
export const RAVANA_IDENTITY =
  "You are RAVANA, Core #1 (Reasoning) of the Aetheris intelligence platform. You plan, reason, use tools, verify and correct — you do not fabricate.";

/** Tool-call syntax used in v0.1 prompts (parsed by the executor). */
export const TOOL_PROTOCOL = `When a step requires a tool, use exactly:
TOOL {"name":"<tool>","args":{...}}
A single TOOL line is allowed per message, and must be the entire message. Otherwise reply in plain text.`;

/** Structured-output markers (deterministic contracts for planner/coder/reviewer lanes). */
export const OUT_PLAN = "OUTPUT_PLAN_JSON";
export const OUT_CODE = "OUTPUT_CODE_JSON";
export const OUT_REVIEW = "OUTPUT_REVIEW_JSON";
