/**
 * Aetheris virtual models. Users (and API-key callers) pick an `aetheris-*` model; each tier is
 * a routing policy over the free provider mesh: which providers are eligible, how many agents
 * Prime may chain, whether Metis runs a critique pass, and the context/output budgets.
 */
import { PLANS, planRank, type PlanId } from "@/aetheris/lib/billing/plans";

export interface ModelTier {
  id: string;
  name: string;
  /** Minimum plan that may use this tier. */
  minPlan: PlanId;
  description: string;
  /** Provider ids allowed (in preference order). Empty = any configured provider. */
  providers: string[];
  /** Whether keyless community providers are acceptable. */
  allowKeyless: boolean;
  maxTokens: number;
  /** Agent orchestration policy. */
  agents: { max: number; parallel: boolean; critique: boolean };
  contextMessages: number;
}

// Strong free-tier providers first; keyless last.
const STRONG = ["groq", "cerebras", "sambanova", "gemini", "github", "mistral", "openrouter", "nvidia", "modelscope", "kilo", "together", "cohere"];
const WIDE = [...STRONG, "cloudflare", "huggingface", "deepseek", "ai21", "ovh", "ollama-cloud", "zai", "siliconflow", "nebius", "chutes", "glhf", "nscale", "perplexity"];

export const MODEL_TIERS: ModelTier[] = [
  {
    id: "aetheris-one",
    name: "Aetheris One",
    minPlan: "free",
    description: "One model over every provider — all your keys, local servers and community endpoints fused. The best available provider answers, load spreads across all of them, rate limits fail over silently. The engine behind every Aetheris model, RAVANA Core and the agents.",
    providers: [],
    allowKeyless: true,
    maxTokens: 8192,
    agents: { max: 6, parallel: true, critique: true },
    contextMessages: 40,
  },
  { id: "aetheris-free", name: "Aetheris Free", minPlan: "free", description: "Hermes answers directly on community + free-tier models.", providers: [], allowKeyless: true, maxTokens: 1024, agents: { max: 1, parallel: false, critique: false }, contextMessages: 12 },
  { id: "aetheris-lite", name: "Aetheris Lite", minPlan: "lite", description: "Prime routes to 1–2 specialists on keyed free-tier providers.", providers: WIDE, allowKeyless: false, maxTokens: 2048, agents: { max: 2, parallel: false, critique: false }, contextMessages: 20 },
  { id: "aetheris-pro", name: "Aetheris Pro", minPlan: "pro", description: "Prime + 3-specialist pipelines on the strongest free-tier models.", providers: STRONG, allowKeyless: false, maxTokens: 4096, agents: { max: 3, parallel: false, critique: false }, contextMessages: 30 },
  { id: "aetheris-pro-max", name: "Aetheris Pro Max", minPlan: "pro-max", description: "Up to 4 specialists in parallel, merged by Prime.", providers: STRONG, allowKeyless: false, maxTokens: 8192, agents: { max: 4, parallel: true, critique: false }, contextMessages: 40 },
  { id: "aetheris-god", name: "Aetheris God", minPlan: "god-mode", description: "6 specialists, parallel synthesis, and a Metis critique-and-revise pass on every answer.", providers: STRONG, allowKeyless: false, maxTokens: 8192, agents: { max: 6, parallel: true, critique: true }, contextMessages: 40 },
];

export function tierById(id?: string | null): ModelTier | undefined {
  return MODEL_TIERS.find((t) => t.id === id);
}

/** Highest tier a plan can use. */
export function maxTierFor(planId: string): ModelTier {
  const rank = planRank(planId);
  let best = MODEL_TIERS[0];
  for (const t of MODEL_TIERS) if (planRank(t.minPlan) <= rank) best = t;
  return best;
}

/** Resolve the requested model against the plan: downgrade silently to the best allowed tier. */
export function resolveTier(requested: string | undefined, planId: string): { tier: ModelTier; downgraded: boolean } {
  const cap = maxTierFor(planId);
  const want = tierById(requested) ?? cap;
  if (planRank(want.minPlan) > planRank(planId)) return { tier: cap, downgraded: true };
  return { tier: want, downgraded: false };
}

export function tiersForPlan(planId: string) {
  return MODEL_TIERS.map((t) => ({ ...t, available: planRank(t.minPlan) <= planRank(planId) }));
}

export { PLANS };
