/**
 * RAVANA · Preview responder (deterministic demo engine).
 *
 * This is NOT a model and never claims to be one. It lets the whole RAVANA pipeline — intent
 * analysis, DAG planning, scheduling, memory, tool policy, verification scaffolding and the
 * execution UI — run end-to-end with zero provider keys. Every trace event and the final answer
 * carry the preview label, so nothing is presented as model output. When a provider becomes
 * reachable the same pipeline runs against the mesh instead (engine: auto).
 *
 * Responders:
 *   OUT_PLAN   → the canonical per-kind DAG (planner.templateNodes) as JSON
 *   OUT_CODE   → a tiny well-formed sample artifact (JSON {summary, files})
 *   OUT_REVIEW → a structural review verdict that only reports what it can actually check
 *   otherwise  → concise deterministic prose derived from the request (never fabricated specifics)
 */
import type { LlmLike, LlmRequest, LlmResponse } from "./base";
import { OUT_CODE, OUT_PLAN, OUT_REVIEW } from "./base";
import { templateNodes } from "../planner";
import type { RavanaKind } from "../types";

const KIND_NOTE: Record<string, string> = {
  chat: "A direct answer with the key facts, clearly separated from anything uncertain.",
  analysis: "A structured explanation that separates observed facts from inferences.",
  coding: "Code with a short design note and the outcome of the checks that were run.",
  research: "A grounded summary that attributes claims to the evidence that was found.",
  math: "A worked result with the final answer stated and double-checked.",
  vision: "A description of the image, then the reasoning it supports.",
  build: "A phased build: requirements, design, first slice, checks, next steps.",
};

export class PreviewLlm implements LlmLike {
  readonly engine = "preview" as const;

  complete(req: LlmRequest): Promise<LlmResponse> {
    const p = req.prompt;
    return Promise.resolve({
      provider: "preview",
      model: "preview-responder-v0.1",
      content: p.includes(OUT_PLAN)
        ? this.plan(req)
        : p.includes(OUT_CODE)
          ? this.code()
          : p.includes(OUT_REVIEW)
            ? this.review(req)
            : this.prose(req),
    });
  }

  /** Canonical DAG for the current kind (same graphs the template planner would produce). */
  private plan(req: LlmRequest): string {
    const kind = (req.prompt.match(/TASK_KIND:(\w+)/)?.[1] ?? "build").toLowerCase() as RavanaKind;
    const tasks = templateNodes(kind, "objective").map((n) => ({ id: n.id, description: n.description, type: n.type, priority: n.priority, dependencies: n.dependencies, tools: n.tools }));
    return JSON.stringify({ tasks, rationale: "Preview plan — canonical per-kind DAG; configure a model provider for model-drafted plans." });
  }

  /** Well-formed sample artifact for a code step (passes real syntax checks). */
  private code(): string {
    return JSON.stringify({
      summary: "Preview implementation: a small, dependency-free module with one function and an inline self-test.",
      files: {
        "main.py": "def analyze_metrics(values):\n    \"\"\"Return (mean, count) for numbers; raises on empty input.\"\"\"\n    if not values:\n        raise ValueError(\"values must not be empty\")\n    return sum(values) / len(values), len(values)\n\n\nif __name__ == \"__main__\":\n    assert analyze_metrics([2, 4, 6]) == (4.0, 3)\n    print(\"self-test ok\")\n",
      },
    });
  }

  /** Structural review: only reports what a deterministic checker can verify. */
  private review(req: LlmRequest): string {
    const answer = req.prompt.slice(-3000);
    const hasContent = answer.trim().length > 0;
    const findings = hasContent ? [] : [{ severity: "major" as const, text: "the step produced no output to review" }];
    return JSON.stringify({ pass: hasContent && findings.length === 0, score: hasContent ? 88 : 0, findings, note: "preview structural review — no model involved" });
  }

  /** Deterministic prose for reasoning/understanding/synthesis steps. */
  private prose(req: LlmRequest): string {
    const heading = (req.prompt.match(/STEP:([^\n]+)/)?.[1] ?? "").trim();
    const kind = (req.prompt.match(/TASK_KIND:(\w+)/)?.[1] ?? "analysis").toLowerCase();
    const note = KIND_NOTE[kind] ?? KIND_NOTE.analysis;
    const out = [`[preview] ${heading || "Reasoning step"}.`, note];
    const objective = req.prompt.match(/OBJECTIVE:([^\n]*)/)?.[1]?.trim();
    if (objective) out.push(`Objective in view: ${objective.slice(0, 240)}`);
    const prior = req.prompt.match(/PRIOR_STEPS:([\s\S]*?)(?:\n[A-Z_]+:|\n$|$)/)?.[1]?.trim();
    if (prior) out.push(`This step builds on: ${prior.slice(0, 700)}`);
    out.push("Run RAVANA with a configured provider (any key in .env.local, or local Ollama/LM Studio) for real model-generated reasoning.");
    return out.join("\n\n");
  }
}
