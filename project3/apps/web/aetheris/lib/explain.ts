/** Pure prompt builder for the AI Explainer (kept out of the route so tests can import it). */
import { agentById, HERMES_BASE } from "@/aetheris/lib/agents/catalog";
import type { ChatMessage } from "@/aetheris/lib/router/types";
import { conceptGlossary } from "@/aetheris/lib/concepts";

export const EXPLAIN_SECTIONS = ["What was asked", "Fact / inference / guess", "Assumptions made", "Confidence", "Most likely to be wrong", "How to verify", "Bias & framing check"] as const;

export function buildExplainPrompt(question: string, answer: string, meta: { provider?: string; model?: string; agents?: string[] }): ChatMessage[] {
  const xai = agentById("xai")!;
  const via = [meta.provider && `provider: ${meta.provider}`, meta.model && `model tier: ${meta.model}`, meta.agents?.length && `agents: ${meta.agents.join(", ")}`].filter(Boolean).join(" · ");
  return [
    { role: "system", content: `${HERMES_BASE}\n\n${xai.system}\n\nFormat: Markdown with exactly these headings, in order: ${EXPLAIN_SECTIONS.map((s) => `### ${s}`).join(", ")}. Under "Confidence" give a percentage and one sentence of reasoning. Under "Fact / inference / guess" use a 3-column table listing the answer's main claims. Keep the whole thing under 350 words. Be honest that you are reasoning about the answer from the outside — you did not produce it and cannot see its internal process. When a limitation maps to a known concept (hallucination, calibration, sycophancy, training cutoff, RAG…), name it and link it as [term](/docs/concept-<id>) so the user can learn more.\n\nConcept glossary (ids in parentheses):\n${conceptGlossary(["hallucination", "calibration", "sycophancy", "training-data", "rag", "reasoning", "bias", "context-window", "verification", "explainability"]).replace(/^- /gm, "- ")}` },
    { role: "user", content: `An AI assistant${via ? ` (${via})` : ""} was asked:\n\n"""\n${question}\n"""\n\nIt answered:\n\n"""\n${answer}\n"""\n\nExplain this answer for the user.` },
  ];
}
