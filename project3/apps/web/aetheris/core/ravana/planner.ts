/**
 * RAVANA · Planning Engine (spec §6, §7).
 *
 *   Objective → task graph (DAG). A task node carries id/description/type/priority/dependencies/
 *   tools — the shape that becomes the foundation for multi-agent execution later.
 *
 * Three planning sources, all normalized through the same validator:
 *   • model    — deep objectives: the reasoning role drafts a DAG from the objective
 *   • template — canonical per-kind DAGs (also what the preview responder returns)
 *   • linear   — chat/analysis/math/vision get one focused node (cheap path)
 */
import type { LlmLike } from "./models/base";
import { OUT_PLAN, RAVANA_IDENTITY } from "./models/base";
import { extractJson } from "../verification/verify";
import type { RavanaKind, RavanaNodeType, RavanaPlanNode, RavanaPriority } from "./types";

/** A plan node before execution state exists (ids present). */
export type PlanSeedNode = Omit<RavanaPlanNode, "status" | "attempts">;

export interface BuiltPlan {
  nodes: RavanaPlanNode[];
  via: "model" | "template" | "linear";
  plannerProvider?: string | null;
  rationale?: string;
}

/** Canonical node maps per kind — shared with the preview responder and tests. */
export function templateNodes(kind: RavanaKind, _objective: string): PlanSeedNode[] {
  const seq: Record<number, string> = {};
  const n = (i: number, type: RavanaNodeType, description: string, dependencies: string[] = [], tools: string[] = [], priority: RavanaPriority = "normal"): PlanSeedNode => {
    const id = `task_${String(i).padStart(3, "0")}`;
    seq[i] = id;
    return { id, type, description, dependencies: dependencies.map((d) => seq[Number(d)] ?? d), tools, priority };
  };
  switch (kind) {
    case "research":
      return [
        n(1, "understand", "Restate the research question and the acceptance criteria for a grounded answer"),
        n(2, "research", "Gather evidence from configured web search; record findings with their sources", ["task_001"], ["web.search"]),
        n(3, "reason", "Weigh the evidence: conflicts, gaps and confidence; draft the answer", ["task_002"]),
      ];
    case "coding":
      return [
        n(1, "understand", "Pin down the code objective: inputs, outputs, edge cases and constraints"),
        n(2, "reason", "Choose the approach: files, functions and the checks that will prove it works", ["task_001"]),
        n(3, "code", "Implement the code with the chosen structure", ["task_002"], ["python.execute"]),
        n(4, "code", "Run the checks over the generated code and fix what fails", ["task_003"], ["python.execute"]),
      ];
    case "build":
      return [
        n(1, "understand", "Turn the objective into concrete requirements and constraints"),
        n(2, "research", "Gather background: relevant past episodes and best practices", ["task_001"], ["web.search"]),
        n(3, "reason", "Design the architecture and the build order of the slices", ["task_002"]),
        n(4, "code", "Implement the first end-to-end slice", ["task_003"], ["python.execute"]),
        n(5, "code", "Check the slice executes; fix what fails", ["task_004"], ["python.execute"]),
        n(6, "synthesize", "Write the build report: what was built, checks run, next slices", ["task_005"]),
      ];
    case "vision":
    case "math":
    case "chat":
    case "analysis":
    default:
      return [n(1, "reason", "Produce the focused answer for this step")];
  }
}

/** Plan-system prompt for the model planner. */
function planPrompt(kind: RavanaKind, objective: string, needsLabel: string): string {
  return `${RAVANA_IDENTITY}
You convert an objective into a dependency graph of executable tasks. Output STRICT JSON only (no markdown fence), matching:
${OUT_PLAN} {"tasks":[{"id":"task_002","description":"…","type":"understand|research|reason|code","priority":"low|normal|high","dependencies":["task_001"],"tools":["memory.search","web.search","python.execute"]}],"rationale":"…"}
Rules: ids are task_001.. in dependency order; type must be one of understand|research|reason|code; every id referenced in dependencies must exist; do not include verification or synthesis tasks (the engine adds those); keep the graph small (4–9 tasks); tasks that can run in parallel must NOT depend on each other.
TASK_KIND: ${kind}
NEEDS: ${needsLabel}
OBJECTIVE:
${objective.slice(0, 4000)}`;
}

/** Normalize any parsed plan into valid seed nodes; drop invalid pieces rather than failing. */
export function normalizePlan(raw: unknown): PlanSeedNode[] {
  if (!raw || typeof raw !== "object") return [];
  const tasks = (raw as { tasks?: unknown }).tasks;
  if (!Array.isArray(tasks)) return [];
  const ids = new Set<string>();
  const out: PlanSeedNode[] = [];
  for (const t of tasks) {
    if (typeof t !== "object" || t === null) continue;
    const tv = t as Record<string, unknown>;
    const id = String(tv.id ?? "").trim();
    const desc = String(tv.description ?? "").trim();
    if (!/^[a-zA-Z0-9_\-]{1,24}$/.test(id) || ids.has(id)) continue;
    if (desc.length < 3) continue;
    ids.add(id);
    const type = (["understand", "research", "reason", "code"].includes(String(tv.type)) ? String(tv.type) : "reason") as RavanaNodeType;
    const deps = Array.isArray(tv.dependencies) ? tv.dependencies.map((d) => String(d)).filter((d) => /^[a-zA-Z0-9_\-]{1,24}$/.test(d) && d !== id) : [];
    const tools = Array.isArray(tv.tools) ? tv.tools.map((t2) => String(t2)).filter(Boolean).slice(0, 4) : [];
    out.push({
      id,
      description: desc.slice(0, 200),
      type,
      priority: (["low", "normal", "high"].includes(String(tv.priority)) ? String(tv.priority) : "normal") as RavanaPriority,
      dependencies: deps,
      tools: tools.slice(0, 3),
    });
  }
  // Drop dependencies on ids that don't exist, then renumber sequentially.
  const exist = new Set(out.map((o) => o.id));
  const renum = new Map<string, string>();
  out.forEach((o, i) => renum.set(o.id, `task_${String(i + 1).padStart(3, "0")}`));
  return out
    .map<PlanSeedNode>((o, i) => ({ ...o, id: `task_${String(i + 1).padStart(3, "0")}`, dependencies: o.dependencies.filter((d) => exist.has(d)).map((d) => renum.get(d)!) }))
    .map((o) => ({ ...o, dependencies: [...o.dependencies] }));
}

/** Remove dependency cycles (keep the earliest node; sever the back-edge). Pure, exported. */
export function breakCycles(nodes: PlanSeedNode[]): PlanSeedNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const state = new Map<string, 0 | 1 | 2>();
  const out: PlanSeedNode[] = [];
  const visit = (n: PlanSeedNode): void => {
    const s = state.get(n.id) ?? 0;
    if (s === 2) return;
    if (s === 1) return; // cycle → drop this back-edge
    state.set(n.id, 1);
    n.dependencies = n.dependencies.filter((d) => {
      const dep = byId.get(d);
      if (!dep) return false;
      if ((state.get(d) ?? 0) === 1) return false;
      visit(dep);
      return true;
    });
    state.set(n.id, 2);
    out.push(n);
  };
  for (const n of [...nodes].sort((a, b) => a.id.localeCompare(b.id))) visit(n);
  return out;
}

/** Detect cycles — returns the first cycle found or null. Exported for tests. */
export function findCycle(nodes: { id: string; dependencies: string[] }[]): string[] | null {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const state = new Map<string, 0 | 1 | 2>();
  const stack: string[] = [];
  const dfs = (id: string): string[] | null => {
    const s = state.get(id) ?? 0;
    if (s === 2) return null;
    if (s === 1) {
      const i = stack.indexOf(id);
      return stack.slice(i).concat(id);
    }
    state.set(id, 1);
    stack.push(id);
    for (const d of byId.get(id)?.dependencies ?? []) {
      if (!byId.has(d)) continue;
      const cyc = dfs(d);
      if (cyc) return cyc;
    }
    stack.pop();
    state.set(id, 2);
    return null;
  };
  for (const n of nodes) {
    const c = dfs(n.id);
    if (c) return c;
  }
  return null;
}

export interface PlanOptions {
  kind: RavanaKind;
  objective: string;
  needsLabel: string;
  depth: "shallow" | "deep";
  llm?: LlmLike | null;
  signal?: AbortSignal;
}

/** Build the executable task graph (anchors + middle tasks), model-assisted for deep goals. */
export async function buildPlan(opts: PlanOptions): Promise<BuiltPlan> {
  const linear = opts.kind === "chat" || opts.kind === "analysis" || opts.kind === "math" || opts.kind === "vision";
  let middle: PlanSeedNode[] = [];
  let via: BuiltPlan["via"] = "linear";
  let plannerProvider: string | null = null;
  let rationale: string | undefined;

  if (!linear && opts.depth === "deep") {
    if (opts.llm && opts.llm.engine === "mesh") {
      try {
        const res = await opts.llm.complete({
          role: "reasoning",
          system: "",
          prompt: planPrompt(opts.kind, opts.objective, opts.needsLabel),
          maxTokens: 1600,
          temperature: 0.2,
          signal: opts.signal,
        });
        const { value } = extractJson(res.content);
        const parsed = normalizePlan(value);
        if (parsed.length >= 2) {
          middle = parsed;
          via = "model";
          plannerProvider = `${res.provider}/${res.model}`;
          const r = value && typeof value === "object" ? String((value as { rationale?: unknown }).rationale ?? "") : "";
          rationale = r || "model-drafted graph";
        }
      } catch {
        middle = [];
      }
    }
    if (via !== "model") {
      middle = templateNodes(opts.kind, opts.objective);
      via = "template";
      rationale = "template graph for this task kind (model planning unavailable in preview/offline)";
    }
  } else if (!linear) {
    middle = templateNodes(opts.kind, opts.objective);
    via = "template";
    rationale = "canonical per-kind graph";
  } else {
    const kinds: Record<string, string> = {
      chat: "Answer the question directly. Be concise and accurate; flag uncertainty.",
      analysis: "Explain thoroughly. Separate what is known from what is inferred.",
      math: "Solve step by step; state the final result clearly.",
      vision: "Describe the image first, then answer the question about it.",
    };
    middle = [{ id: "task_001", type: "reason", description: kinds[opts.kind] ?? kinds.analysis, dependencies: [], tools: [], priority: "normal" }];
    via = "linear";
  }

  const nodes: RavanaPlanNode[] = breakCycles(middle.map((n) => ({ ...n, dependencies: [...n.dependencies] }))).map((n, i) => ({
    ...n,
    id: `task_${String(i + 1).padStart(3, "0")}`,
    dependencies: [...n.dependencies],
    status: "pending",
    attempts: 0,
  }));
  return { nodes, via, plannerProvider, rationale };
}
