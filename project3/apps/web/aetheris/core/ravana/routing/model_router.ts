/**
 * RAVANA · Model Router (spec §5) — one of the most valuable components.
 *
 *   Task node → Task/role classifier → ordered provider candidates (role fit × health × locality)
 *   → primary + fallback chain → model.selected event
 *
 * RAVANA never binds to one model. Roles are: fast, reasoning, coding, vision. Providers are the
 * Aetheris mesh (keyless community endpoints work with no key; local Ollama/LM Studio/vLLM
 * activate via their env flags). Per-role overrides are read from RAVANA_MODEL_<ROLE>, e.g.
 * RAVANA_MODEL_CODING=groq or RAVANA_MODEL_REASONING=openrouter/deepseek:r1
 */
import { orderedCandidates } from "@/aetheris/lib/router/router";
import { allProviders } from "@/aetheris/lib/router/providers";
import type { ProviderConfig } from "@/aetheris/lib/router/types";
import type { RavanaRole } from "../types";

const providerIds = () => new Set(allProviders().map((p) => p.id));

export interface RouterConstraints {
  locality?: "local" | "prefer_local" | "remote" | "any";
  needsTools?: boolean;
  minContext?: number;
  avoidModels?: string[];
  allowKeyless?: boolean;
  providerAllow?: string[];
  /** Force a specific provider id. */
  preferred?: string;
  hasImages?: boolean;
}

export interface ModelSelection {
  role: RavanaRole;
  /** Ordered chain — route() will fail over along it. */
  candidates: ProviderConfig[];
  primary: ProviderConfig | null;
  reason: string;
  override?: string;
}

const ROLE_TASK: Record<RavanaRole, "fast" | "reasoning" | "coding" | "long_context"> = {
  fast: "fast",
  reasoning: "reasoning",
  coding: "coding",
  vision: "reasoning", // vision arrives via provider capability, not task fit
};

const ROLE_ENV: Record<RavanaRole, string> = {
  fast: "RAVANA_MODEL_FAST",
  reasoning: "RAVANA_MODEL_REASONING",
  coding: "RAVANA_MODEL_CODING",
  vision: "RAVANA_MODEL_VISION",
};

/** Read RAVANA_MODEL_<ROLE> = provider[:model] style overrides (env config, spec §4 example). */
export function roleOverride(role: RavanaRole): { provider?: string; model?: string; raw?: string } {
  const raw = (process.env[ROLE_ENV[role]] ?? "").trim();
  if (!raw) return {};
  const [provider, model] = raw.split("/");
  return { provider: provider || undefined, model: model || undefined, raw };
}

/**
 * Pure candidate selection — exported for tests. Deterministic order after the mesh's own
 * priority/health ordering: role-fit re-rank is stable, so identical inputs give identical picks.
 * An env pin naming a provider that is NOT configured yields no candidates (no silent fallback):
 * auto-engine then falls back to the labelled preview responder instead of lying about the model.
 */
export function selectCandidates(role: RavanaRole, constraints: RouterConstraints = {}): ModelSelection {
  const env = roleOverride(role);
  const pinBroken = !!env.provider && !providerIds().has(env.provider);
  if (pinBroken) {
    return {
      role,
      candidates: [],
      primary: null,
      reason: `${ROLE_ENV[role]}=${env.raw} — provider "${env.provider}" is not configured; no candidates for this role`,
      override: env.raw,
    };
  }
  const allow = constraints.providerAllow ?? (env.provider ? [env.provider] : undefined);
  const policy = {
    task: ROLE_TASK[role],
    needsTools: constraints.needsTools,
    minContext: constraints.minContext,
    avoidModels: constraints.avoidModels,
    locality: constraints.locality ?? (process.env.AETHERIS_LOCALITY as RouterConstraints["locality"]) ?? "any",
  };
  const candidates = orderedCandidates({
    vision: !!constraints.hasImages,
    allow,
    allowKeyless: constraints.allowKeyless ?? true,
    preferred: constraints.preferred ?? env.provider,
    policy,
  });
  const primary = candidates[0] ?? null;
  const parts: string[] = [];
  if (env.raw) parts.push(`role pinned to ${env.raw} via ${ROLE_ENV[role]}`);
  parts.push(primary ? `primary ${primary.id}/${primary.model}` : "no configured provider for this role");
  if (candidates.length > 1) parts.push(`${candidates.length - 1} failover candidate(s)`);
  return { role, candidates, primary, reason: parts.join(" · "), override: env.raw };
}

/** Snapshot for GET /api/v1/ravana/models — role pool with honest configuration status. */
export function modelPool() {
  const roles: RavanaRole[] = ["fast", "reasoning", "coding", "vision"];
  const descriptions: Record<RavanaRole, string> = {
    fast: "Short, direct answers — quick questions, summaries, self-checks",
    reasoning: "Deep analysis, research synthesis, mathematics, planning",
    coding: "Code generation, debugging and test-fix loops",
    vision: "Image analysis — only providers that accept images",
  };
  const details = roles.map((role) => {
    const env = roleOverride(role);
    const sel = selectCandidates(role);
    return {
      role,
      description: descriptions[role],
      override: env.raw ?? null,
      envKey: ROLE_ENV[role],
      primary: sel.primary ? { provider: sel.primary.id, model: sel.primary.model, locality: sel.primary.local ? "local" : "remote", keyless: !!sel.primary.keyless } : null,
      candidates: sel.candidates.slice(0, 8).map((p) => ({ provider: p.id, model: p.model, locality: p.local ? "local" : "remote", keyless: !!p.keyless, costClass: p.costClass ?? "free", contextTokens: p.contextTokens ?? null, strengths: p.strengths ?? [] })),
      status: sel.primary ? "configured" : "not_configured",
      reason: sel.reason,
    };
  });
  return { router: "role→mesh candidate chain with failover", policy: { locality: process.env.AETHERIS_LOCALITY ?? "any", envOverrides: "RAVANA_MODEL_<FAST|REASONING|CODING|VISION>=provider[:model]" }, roles: details };
}
