import { record } from "@/aetheris/core/observability/events";
import { callProvider, hasImages, hasVideo } from "./adapters";
import { hydrateRouterStores } from "./hydrate";
import { allProviders, apiKeyFor, isConfigured, providerKey, providerKeySource, resolveModel } from "./providers";
import { ProviderError, type ChatMessage, type ProviderAttempt, type ProviderConfig, type RouteResult } from "./types";

/** Short display prefix for a key (never the secret itself). */
export function maskKey(key?: string): string | null {
  if (!key) return null;
  return key.length > 12 ? `${key.slice(0, 5)}…${key.slice(-4)}` : `${key.slice(0, 2)}…`;
}

/** Cooldown applied after a rate limit / server error, per provider. */
const RATE_LIMIT_COOLDOWN_MS = Number(process.env.AETHERIS_COOLDOWN_MS ?? 60_000);
/** Cooldown applied when a key is rejected — long, since it won't fix itself. */
const AUTH_FAIL_COOLDOWN_MS = 15 * 60_000;

interface HealthEntry {
  cooldownUntil: number;
  lastError?: string;
  lastStatus?: number;
  successes: number;
  failures: number;
  avgLatencyMs: number;
}

// Module-level state: persists across requests within a warm server instance.
const health = new Map<string, HealthEntry>();

/** Health score in (0, 1]: Bayesian success rate, lightly penalised by latency. Unknown providers score neutral. */
function score(id: string): number {
  const e = entry(id);
  const rate = (e.successes + 1) / (e.successes + e.failures + 2);
  const lat = e.avgLatencyMs ? Math.min(1, 1500 / e.avgLatencyMs) : 0.8;
  return rate * 0.8 + lat * 0.2;
}

function entry(id: string): HealthEntry {
  let e = health.get(id);
  if (!e) {
    e = { cooldownUntil: 0, successes: 0, failures: 0, avgLatencyMs: 0 };
    health.set(id, e);
  }
  return e;
}

function recordSuccess(id: string, latencyMs: number) {
  const e = entry(id);
  e.successes += 1;
  e.avgLatencyMs = e.avgLatencyMs === 0 ? latencyMs : e.avgLatencyMs * 0.8 + latencyMs * 0.2;
  e.cooldownUntil = 0;
  e.lastError = undefined;
  e.lastStatus = undefined;
}

function recordFailure(id: string, err: unknown) {
  const e = entry(id);
  e.failures += 1;
  if (err instanceof ProviderError) {
    e.lastError = err.message;
    e.lastStatus = err.status;
    if (err.status === 401 || err.status === 403) {
      e.cooldownUntil = Date.now() + AUTH_FAIL_COOLDOWN_MS;
    } else if (err.retryable) {
      e.cooldownUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS;
    } else {
      // e.g. 400/404 from a bad model name — back off briefly so we don't hammer it
      e.cooldownUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS;
    }
  } else {
    e.lastError = err instanceof Error ? err.message : String(err);
    e.cooldownUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS;
  }
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Build the ordered candidate list: configured providers, grouped by priority, shuffled
 * within each group (cheap load balancing), with cooled-down providers pushed to the end
 * as a last resort.
 */
/** Per-request routing policy (Phase 4): what the task needs and where it may run. */
export interface ModelPolicy {
  task?: "coding" | "reasoning" | "chat" | "long_context" | "fast" | "multilingual";
  /** local = only local providers; prefer_local = local first; remote = cloud only; any = default order. */
  locality?: "local" | "prefer_local" | "remote" | "any";
  /** Approx prompt tokens; providers with a smaller declared context are dropped. */
  minContext?: number;
  needsTools?: boolean;
  /**
   * Drop providers serving these model names. Used by the verification engine so a reviewer is
   * routed to a *different* model than the one that produced the answer — independence becomes a
   * routing property, not a hope. Providers that survive are preferred; if every candidate is
   * avoided the filter is not applied (a same-model review is better than no review, and the
   * caller sees `independent:false`).
   */
  avoidModels?: string[];
}
export const approxTokens = (msgs: { content: string }[]) => Math.ceil(msgs.reduce((n, m) => n + m.content.length, 0) / 3.5);

/** Pure re-ranking of an ordered candidate list by task fit. Exported for tests. */
export function applyPolicy(list: ProviderConfig[], pol?: ModelPolicy): ProviderConfig[] {
  if (!pol) return list;
  let out = list;
  if (pol.locality === "local") out = out.filter((p) => p.local);
  else if (pol.locality === "remote") out = out.filter((p) => !p.local);
  if (pol.minContext) { const fit = out.filter((p) => !p.contextTokens || p.contextTokens >= pol.minContext!); if (fit.length) out = fit; }
  if (pol.avoidModels?.length) { const kept = out.filter((p) => !pol.avoidModels!.includes(p.model ?? "")); if (kept.length) out = kept; }
  const fit = (p: ProviderConfig) => {
    let f = 0;
    if (pol.task && p.strengths?.includes(pol.task as never)) f += 2;
    if (pol.task === "long_context" && (p.contextTokens ?? 0) >= 100_000) f += 2;
    if (pol.needsTools && p.strengths?.includes("tools")) f += 1;
    if (pol.locality === "prefer_local" && p.local) f += 3;
    return f;
  };
  // stable sort: keep original (priority/health) order among equal fit
  return out.map((p, i) => ({ p, i, f: fit(p) })).sort((a, b) => b.f - a.f || a.i - b.i).map((x) => x.p);
}

export function orderedCandidates(opts?: { preferred?: string; exclude?: string[]; vision?: boolean; video?: boolean; allow?: string[]; allowKeyless?: boolean; priority?: boolean; policy?: ModelPolicy }): ProviderConfig[] {
  const now = Date.now();
  // Video is a stricter requirement than vision: only providers that take video inline qualify, and
  // the fallback is nothing (a video sent to an image-only provider is a guaranteed 400).
  let configured = allProviders().filter((p) => isConfigured(p) && !opts?.exclude?.includes(p.id) && (!opts?.vision || p.vision) && (!opts?.video || p.video));
  // Tier policy: restrict to an allow-list and/or drop keyless community endpoints — but never
  // leave the user with nothing: fall back to the full configured set if the policy empties it.
  // Providers the user added themselves (custom by-link endpoints) are always eligible on every
  // tier: they are their own machines/gateways, not community endpoints.
  if (opts?.allow?.length) {
    const pick = configured.filter((p) => p.custom || opts.allow!.includes(p.id));
    if (pick.length) configured = pick;
  }
  if (opts?.allowKeyless === false) {
    const keyed = configured.filter((p) => p.custom || !p.keyless || !!providerKey(p));
    if (keyed.length) configured = keyed;
  }

  const groups = new Map<number, ProviderConfig[]>();
  for (const p of configured) {
    const g = groups.get(p.priority) ?? [];
    g.push(p);
    groups.set(p.priority, g);
  }
  // Priority routing (paid plans): inside each priority group, rank by observed health
  // (success rate, then latency) instead of shuffling — best provider first, every time.
  const rank = (list: ProviderConfig[]) => opts?.priority
    ? [...list].sort((a, b) => score(b.id) - score(a.id))
    : shuffle(list);
  const ordered = [...groups.keys()].sort((a, b) => a - b).flatMap((k) => rank(groups.get(k)!));

  const healthy = ordered.filter((p) => entry(p.id).cooldownUntil <= now);
  const cooling = ordered.filter((p) => entry(p.id).cooldownUntil > now);
  let list = [...healthy, ...cooling];

  list = applyPolicy(list, opts?.policy);
  if (opts?.preferred) {
    const idx = list.findIndex((p) => p.id === opts.preferred);
    if (idx > 0) {
      const [pref] = list.splice(idx, 1);
      list = [pref, ...list];
    }
  }
  return list;
}

/** Infer a routing policy from the conversation (cheap heuristics; callers may override). */
export function inferPolicy(messages: { role: string; content: string }[]): ModelPolicy {
  const last = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
  const tokens = approxTokens(messages);
  const pol: ModelPolicy = {};
  if (/```|\b(function|class|import|def |const |bug|stack ?trace|compile|refactor|typescript|python|sql)\b/i.test(last)) pol.task = "coding";
  else if (/\b(prove|derive|step by step|reason|why does|analy[sz]e|compare|trade-?offs?)\b/i.test(last)) pol.task = "reasoning";
  else if (/[\u0B80-\u0BFF\u0900-\u097F]/.test(last)) pol.task = "multilingual";
  if (tokens > 24_000) { pol.task = "long_context"; pol.minContext = Math.ceil(tokens * 1.3); }
  const pref = process.env.AETHERIS_LOCALITY as ModelPolicy["locality"] | undefined;
  if (pref) pol.locality = pref;
  return pol;
}

export interface RouteOptions {
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  /** Try this provider first if configured. */
  preferred?: string;
  /** Cap the number of providers tried. */
  maxAttempts?: number;
  signal?: AbortSignal;
  /**
   * Stream text deltas. Failover stays silent as long as the failing provider has not yet
   * emitted anything; once tokens have been streamed a failure is surfaced (partial text is
   * kept) rather than restarting with another provider.
   */
  onDelta?: (text: string, provider: string) => void;
  /** Tier policy: provider allow-list (preference order) and whether keyless providers count. */
  allow?: string[];
  allowKeyless?: boolean;
  /** Priority routing: health-ranked instead of shuffled (paid plans). */
  priority?: boolean;
  /** Task-aware policy; when omitted it is inferred from the messages. */
  policy?: ModelPolicy;
}

export async function route(opts: RouteOptions): Promise<RouteResult> {
  await hydrateRouterStores(); // hosted: refresh runtime keys + custom providers (TTL-gated; no-op on files)
  const vision = hasImages(opts.messages);
  const video = vision && hasVideo(opts.messages);
  const policy = opts.policy ?? inferPolicy(opts.messages);
  const candidates = orderedCandidates({ preferred: opts.preferred, vision, video, allow: opts.allow, allowKeyless: opts.allowKeyless, priority: opts.priority, policy });
  if (candidates.length === 0) {
    throw new ProviderError(
      video
        ? "No provider configured that accepts inline video (set GEMINI_API_KEY — free — or install ffmpeg so frames can be sampled instead)."
        : vision
          ? "No vision-capable provider configured (Groq, Gemini, GitHub Models, OpenRouter, Mistral, Together, SambaNova or NVIDIA)."
          : "No providers configured. Add at least one API key to .env.local (see .env.example).",
      503,
      false,
    );
  }

  const attempts: ProviderAttempt[] = [];
  const max = Math.min(opts.maxAttempts ?? candidates.length, candidates.length);

  for (const provider of candidates.slice(0, max)) {
    if (opts.signal?.aborted) throw new ProviderError("request aborted", 499, false);
    const model = resolveModel(provider, { vision });
    const apiKey = apiKeyFor(provider);
    const started = Date.now();
    let streamed = 0;
    try {
      const content = await callProvider({
        provider,
        model,
        apiKey,
        messages: opts.messages,
        temperature: opts.temperature,
        maxTokens: opts.maxTokens,
        signal: opts.signal,
        onDelta: opts.onDelta ? (t) => { streamed += t.length; opts.onDelta!(t, provider.id); } : undefined,
      });
      const latencyMs = Date.now() - started;
      recordSuccess(provider.id, latencyMs);
      record({ type: "model", capability: `model:${provider.id}`, ok: true, ms: latencyMs, meta: { model, attempts: attempts.length + 1, streamed: streamed > 0, task: policy.task, local: !!provider.local, costClass: provider.costClass ?? "free" } });
      attempts.push({ provider: provider.id, ok: true, latencyMs });
      return { provider: provider.id, model, content, latencyMs, attempts };
    } catch (err) {
      const latencyMs = Date.now() - started;
      recordFailure(provider.id, err);
      record({ type: "model", capability: `model:${provider.id}`, ok: false, ms: latencyMs, detail: err instanceof Error ? err.message : String(err) });
      attempts.push({
        provider: provider.id,
        ok: false,
        status: err instanceof ProviderError ? err.status : undefined,
        error: err instanceof Error ? err.message : String(err),
        latencyMs,
      });
      if (err instanceof ProviderError && err.status === 499) throw err;
      if (streamed > 0) {
        const e = new ProviderError(`${provider.id} failed mid-stream: ${err instanceof Error ? err.message : String(err)}`, 502, false);
        (e as ProviderError & { attempts?: ProviderAttempt[] }).attempts = attempts;
        throw e;
      }
      // otherwise: fall through to the next provider
    }
  }

  const summary = attempts.map((a) => `${a.provider}: ${a.error ?? "unknown"}`).join(" | ");
  const allNetwork = attempts.length > 0 && attempts.every((a) => (a.error ?? "").startsWith("network error"));
  const msg = allNetwork
    ? `This server has no outbound internet access — every provider request failed before reaching the provider (${summary}). ` +
      `This is a hosting/network limitation, not a provider or key issue: run Aetheris locally (npm run dev) or deploy it (Docker / Render / Fly) and the same request will succeed.`
    : `All ${attempts.length} provider(s) failed. ${summary}`;
  const e = new ProviderError(msg, 502, false);
  (e as ProviderError & { attempts?: ProviderAttempt[] }).attempts = attempts;
  throw e;
}

/** Snapshot of the mesh for the /api/providers endpoint and the UI status strip. */
export function meshStatus() {
  const now = Date.now();
  return allProviders().map((p) => {
    const configured = isConfigured(p);
    const h = entry(p.id);
    const coolingDown = h.cooldownUntil > now;
    return {
      id: p.id,
      name: p.name,
      model: resolveModel(p),
      priority: p.priority,
      envKey: p.envKey,
      baseUrl: p.baseUrl,
      custom: !!p.custom,
      local: !!p.local,
      notes: p.notes,
      keyless: !!p.keyless,
      hasKey: !!providerKey(p),
      keySource: providerKeySource(p) ?? null,
      maskedKey: maskKey(providerKey(p)),
      keyUrl: p.keyUrl,
      freeTier: p.freeTier,
      configured,
      state: !configured ? "unconfigured" : coolingDown ? "cooldown" : "ready",
      cooldownSecs: coolingDown ? Math.ceil((h.cooldownUntil - now) / 1000) : 0,
      successes: h.successes,
      failures: h.failures,
      avgLatencyMs: Math.round(h.avgLatencyMs),
      lastError: h.lastError,
      lastStatus: h.lastStatus,
    };
  });
}
