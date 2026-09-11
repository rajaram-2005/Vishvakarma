/**
 * Model Arena.
 *
 *   Runs the same prompt against every provider the user has
 *   configured (in parallel), then composes a side-by-side
 *   comparison: provider, model, content, latencyMs, ok, error,
 *   per-token cost class.
 *
 *   Real, tested runs — not mock traffic. The arena respects
 *   the production route() function for each provider call, so
 *   it benefits from failover, cooldowns, and key handling.
 *
 *   In a CI environment with no API keys configured, every
 *   provider is `not_configured` and the arena returns the
 *   provider list with a per-row "not_configured" reason.
 *   That's the honest answer.
 */

import { PROVIDERS, isConfigured, providerById, resolveModel } from "@/aetheris/lib/router/providers";
import type { ProviderConfig } from "@/aetheris/lib/router/types";
import { route, type RouteOptions } from "@/aetheris/lib/router/router";

export interface ArenaRow {
  providerId: string;
  providerName: string;
  model: string;
  configured: boolean;
  /** "ok" | "error" | "not_configured" */
  status: "ok" | "error" | "not_configured";
  content: string | null;
  latencyMs: number;
  error: string | null;
  /** Provider cost class for the comparison row. */
  costClass: string;
  locality: string;
}

export interface ArenaResult {
  prompt: string;
  total: number;
  configured: number;
  succeeded: number;
  failed: number;
  rows: ArenaRow[];
  /** Concatenated best-of responses (longest non-empty content, if any). */
  best: ArenaRow | null;
  assembledAt: number;
}

const SYSTEM = "You are a concise assistant. Answer the user's question in 1-3 sentences, exactly as you would in a chat. No preamble, no lists.";

async function runOne(p: ProviderConfig, prompt: string): Promise<ArenaRow> {
  const configured = isConfigured(p);
  if (!configured) {
    return {
      providerId: p.id,
      providerName: p.name,
      model: resolveModel(p),
      configured: false,
      status: "not_configured",
      content: null,
      latencyMs: 0,
      error: `${p.id} not configured (set ${p.envKey})`,
      costClass: p.costClass ?? "unknown",
      locality: p.local ? "local" : "remote",
    };
  }
  const opts: RouteOptions = {
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: prompt },
    ],
    allow: [p.id],
    maxTokens: 256,
    temperature: 0.2,
  };
  const t0 = Date.now();
  try {
    const r = await route(opts);
    return {
      providerId: p.id,
      providerName: p.name,
      model: r.model,
      configured: true,
      status: "ok",
      content: r.content,
      latencyMs: Date.now() - t0,
      error: null,
      costClass: p.costClass ?? "unknown",
      locality: p.local ? "local" : "remote",
    };
  } catch (e) {
    return {
      providerId: p.id,
      providerName: p.name,
      model: resolveModel(p),
      configured: true,
      status: "error",
      content: null,
      latencyMs: Date.now() - t0,
      error: (e as Error).message,
      costClass: p.costClass ?? "unknown",
      locality: p.local ? "local" : "remote",
    };
  }
}

export async function runArena(prompt: string, opts: { providerIds?: string[]; includeKeylessOnly?: boolean } = {}): Promise<ArenaResult> {
  const providers = opts.providerIds && opts.providerIds.length > 0
    ? opts.providerIds.map((id) => providerById(id)).filter((p): p is ProviderConfig => !!p)
    : PROVIDERS;
  const rows = await Promise.all(providers.map((p) => runOne(p, prompt)));
  rows.sort((a, b) => a.providerId.localeCompare(b.providerId));
  const succeeded = rows.filter((r) => r.status === "ok");
  const failed = rows.filter((r) => r.status === "error" || r.status === "not_configured");
  const best = succeeded.length === 0
    ? null
    : succeeded.reduce((b, r) => ((r.content?.length ?? 0) > (b.content?.length ?? 0) ? r : b));
  return {
    prompt,
    total: rows.length,
    configured: rows.filter((r) => r.configured).length,
    succeeded: succeeded.length,
    failed: failed.length,
    rows,
    best,
    assembledAt: Date.now(),
  };
}

export function arenaProviderList() {
  return PROVIDERS.map((p) => ({
    id: p.id,
    name: p.name,
    costClass: p.costClass ?? "unknown",
    locality: p.local ? "local" : "remote",
    configured: isConfigured(p),
  }));
}
