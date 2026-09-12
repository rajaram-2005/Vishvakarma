export type Role = "system" | "user" | "assistant";

export interface ChatMessage {
  role: Role;
  content: string;
  /** Optional image attachments (data: URLs or https URLs). Routed to vision-capable providers only. */
  images?: string[];
}

export type AdapterKind = "openai" | "gemini" | "cohere" | "cloudflare";

export interface ProviderConfig {
  /** Stable identifier, e.g. "groq" */
  id: string;
  /** Human-readable name */
  name: string;
  /** Which wire protocol this provider speaks */
  kind: AdapterKind;
  /** Base URL (OpenAI-compatible providers: the URL that /chat/completions is appended to) */
  baseUrl: string;
  /** Environment variable holding the API key */
  envKey: string;
  /**
   * Works without any key (anonymous / community tier). The provider is always "configured";
   * a key in `envKey`, if present, raises the rate limit.
   */
  keyless?: boolean;
  /** Where to obtain a free key. */
  keyUrl?: string;
  /** Documented free-tier limit, for the Providers page. */
  freeTier?: string;
  /** Default model to use */
  model: string;
  /** Model used when the request contains images (omit if `model` is already multimodal). */
  visionModel?: string;
  /** Whether this provider can accept images (with `visionModel` or `model`). */
  vision?: boolean;
  /**
   * Whether this provider accepts video *inline* in the same request (Google AI Studio does; the
   * OpenAI-compatible endpoints do not). When a request carries video the router keeps only these,
   * so a video never reaches a provider that would reject it with a 400.
   */
  video?: boolean;
  /** Lower = tried first. Ties are shuffled for load balancing. */
  priority: number;
  /** Task strengths for task-aware routing (Phase 4). Missing = general. */
  strengths?: ("coding" | "reasoning" | "long_context" | "fast" | "multilingual" | "tools")[];
  /** Approx context window in tokens (for long-context routing). */
  contextTokens?: number;
  /** Cost class: all bundled providers are free tier; local = free & private. */
  costClass?: "free" | "local" | "credit" | "paid";
  /** Runs on the user's machine / LAN. */
  local?: boolean;
  /** Extra headers required by the provider */
  headers?: Record<string, string>;
  /** Added by the user from the app (Settings → API keys → add by link), not a built-in. */
  custom?: boolean;
  /** Notes shown in the UI / docs */
  notes?: string;
}

export interface ProviderResult {
  provider: string;
  model: string;
  content: string;
  latencyMs: number;
}

export interface ProviderAttempt {
  provider: string;
  ok: boolean;
  status?: number;
  error?: string;
  latencyMs: number;
}

export interface RouteResult extends ProviderResult {
  attempts: ProviderAttempt[];
}

export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly status: number | undefined,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}
