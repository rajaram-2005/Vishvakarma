export type Feature = "video" | "factory_enterprise" | "mcp_premium" | "agents" | "parallel_agents" | "priority_routing" | "api_access" | "deep_research";

export type PlanId = "free" | "lite" | "pro" | "pro-max" | "god-mode";

/**
 * Aetheris is free for everyone. When FREE_FOR_ALL is on (the default), every user gets the full
 * God Mode feature set with no metering and no payments. Set AETHERIS_PAID_PLANS=1 to re-enable
 * the plan/UPI billing system on a self-hosted deployment.
 */
export const freeForAll = () => process.env.AETHERIS_PAID_PLANS !== "1";

export interface Plan {
  id: PlanId;
  name: string;
  priceInr: number;      // 0 = free
  days: number;
  /** Daily credits (1 chat = 1, agents = 2, research = 5). null = unlimited. */
  dailyCredits: number | null;
  /** Highest Aetheris model this plan may use. */
  maxModel: string;
  /** Number of personal API keys allowed. */
  apiKeys: number;
  /** Max specialists Prime may chain in one run. */
  maxAgents: number;
  features: Feature[];
  blurb: string;
  highlights: string[];
}

export const PLANS: Plan[] = [
  {
    id: "free", name: "Free", priceInr: 0, days: 0, dailyCredits: Number(process.env.AETHERIS_FREE_DAILY_MESSAGES ?? 50),
    maxModel: "aetheris-one", apiKeys: 0, maxAgents: 1, features: [],
    blurb: "Try Aetheris. One model over every provider.",
    highlights: ["50 credits / day", "Aetheris One model — every provider fused", "Single agent on the combined mesh"],
  },
  {
    id: "lite", name: "Lite", priceInr: 200, days: 30, dailyCredits: 300,
    maxModel: "aetheris-lite", apiKeys: 1, maxAgents: 2, features: ["agents", "api_access"],
    blurb: "For students & solo builders.",
    highlights: ["300 credits / day", "aetheris-lite model", "Prime routing, 2-agent pipelines", "1 personal API key"],
  },
  {
    id: "pro", name: "Pro", priceInr: 500, days: 30, dailyCredits: 1000,
    maxModel: "aetheris-pro", apiKeys: 3, maxAgents: 3, features: ["agents", "api_access", "deep_research", "mcp_premium", "priority_routing"],
    blurb: "Daily driver for professionals.",
    highlights: ["1,000 credits / day", "aetheris-pro model", "3-agent pipelines + Deep Research", "Premium MCP apps", "3 API keys, priority routing"],
  },
  {
    id: "pro-max", name: "Pro Max", priceInr: 1500, days: 30, dailyCredits: 4000,
    maxModel: "aetheris-pro-max", apiKeys: 10, maxAgents: 4, features: ["agents", "parallel_agents", "api_access", "deep_research", "mcp_premium", "priority_routing", "video"],
    blurb: "Teams, agencies, heavy automation.",
    highlights: ["4,000 credits / day", "aetheris-pro-max model", "Parallel agents + Prime synthesis", "Video generation", "10 API keys"],
  },
  {
    id: "god-mode", name: "God Mode", priceInr: 4000, days: 30, dailyCredits: null,
    maxModel: "aetheris-god", apiKeys: 50, maxAgents: 6, features: ["agents", "parallel_agents", "api_access", "deep_research", "mcp_premium", "priority_routing", "video", "factory_enterprise"],
    blurb: "Unlimited. Every agent, every model, every tool.",
    highlights: ["Unlimited credits", "aetheris-god model (Metis self-critique loop)", "Up to 6 agents per run", "Enterprise GitHub Factory", "50 API keys, top priority"],
  },
];

export const FREE_PLAN = PLANS[0];
export const FREE_DAILY_MESSAGES = FREE_PLAN.dailyCredits ?? 50;

export function planById(id: string): Plan | undefined {
  return PLANS.find((p) => p.id === id);
}

/** Rank for comparisons (free < lite < pro < pro-max < god-mode). */
export function planRank(id: string): number {
  return Math.max(0, PLANS.findIndex((p) => p.id === id));
}

/** Hardcoded payee — all payments route to the founder. */
export const PAYEE = {
  vpa: process.env.AETHERIS_UPI_VPA ?? "9488407998@upi",
  name: process.env.AETHERIS_UPI_NAME ?? "Rajaram",
  phone: "+919488407998",
  email: "ramkpraja175@gmail.com",
};
