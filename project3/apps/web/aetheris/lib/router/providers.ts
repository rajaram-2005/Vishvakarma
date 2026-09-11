import type { ProviderConfig } from "./types";
import { resolvedEnv, runtimeKeyFor } from "./runtimeKeys";
import { listCustomProviders, toProviderConfig } from "./customProviders";

/**
 * The Aetheris provider mesh.
 *
 * Every provider here has a free tier (or free developer credits) at the time of writing.
 * A provider is only *active* if its API key is set — in .env (classic) or in the app's
 * runtime key store (Settings → API keys, no restart needed). The router tries providers in
 * priority order (lower first), shuffling within the same priority, and fails over on
 * rate limits / errors.
 *
 * Model names are defaults and can be overridden per provider with AETHERIS_MODEL_<ID>
 * (e.g. AETHERIS_MODEL_GROQ=llama-3.1-8b-instant).
 */
export const PROVIDERS: ProviderConfig[] = [
  // ---- Tier 1: fast + generous free tiers -------------------------------------------
  {
    id: "groq",
    name: "Groq Cloud",
    kind: "openai",
    baseUrl: "https://api.groq.com/openai/v1",
    envKey: "GROQ_API_KEY",
    model: "llama-3.3-70b-versatile",
    priority: 1, strengths: ["fast", "tools"], contextTokens: 128_000,
    keyUrl: "https://console.groq.com/keys",
    freeTier: "30 RPM · 14.4K RPD · no card",
    vision: true, visionModel: "meta-llama/llama-4-scout-17b-16e-instruct",
    notes: "LPU-accelerated Llama; very fast, free tier.",
  },
  {
    id: "cerebras",
    name: "Cerebras Inference",
    kind: "openai",
    baseUrl: "https://api.cerebras.ai/v1",
    envKey: "CEREBRAS_API_KEY",
    model: "llama-3.3-70b",
    priority: 1, strengths: ["fast"], contextTokens: 8_000,
    keyUrl: "https://cloud.cerebras.ai",
    freeTier: "30 RPM · ~1M tokens/day · no card",
    notes: "Wafer-scale inference, free tier.",
  },
  {
    id: "sambanova",
    name: "SambaNova Cloud",
    kind: "openai",
    baseUrl: "https://api.sambanova.ai/v1",
    envKey: "SAMBANOVA_API_KEY",
    model: "Meta-Llama-3.3-70B-Instruct",
    priority: 1,
    keyUrl: "https://cloud.sambanova.ai/apis",
    freeTier: "10–30 RPM · $5 trial credit",
    vision: true, visionModel: "Llama-4-Maverick-17B-128E-Instruct",
    notes: "High-speed free tier inference.",
  },
  {
    id: "gemini",
    name: "Google AI Studio",
    kind: "gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    envKey: "GEMINI_API_KEY",
    model: "gemini-2.0-flash",
    priority: 1,
    keyUrl: "https://aistudio.google.com/app/apikey",
    freeTier: "15 RPM · 1,500 RPD · no card",
    vision: true,
    video: true,
    notes: "Gemini Flash; generous free tier. Accepts inline video (mp4), so `perceive({modality:\"video\"})` works with no ffmpeg on the host.",
  },

  // ---- Tier 2: solid free tiers -----------------------------------------------------
  {
    id: "github",
    name: "GitHub Models",
    kind: "openai",
    baseUrl: "https://models.github.ai/inference",
    envKey: "GITHUB_MODELS_TOKEN",
    model: "openai/gpt-4o-mini",
    priority: 2,
    keyUrl: "https://github.com/settings/tokens",
    freeTier: "50–150 RPD · any GitHub account",
    vision: true,
    notes: "Free for developers with a GitHub PAT (models:read scope).",
  },
  {
    id: "openrouter",
    name: "OpenRouter (free)",
    kind: "openai",
    baseUrl: "https://openrouter.ai/api/v1",
    envKey: "OPENROUTER_API_KEY",
    model: "meta-llama/llama-3.3-70b-instruct:free",
    priority: 2,
    keyUrl: "https://openrouter.ai/keys",
    freeTier: "20 RPM · 50 RPD on :free models",
    vision: true, visionModel: "google/gemma-3-27b-it:free",
    headers: {
      "HTTP-Referer": "https://github.com/rajaram-2005/Aetheris",
      "X-Title": "Aetheris One",
    },
    notes: "Aggregator of dozens of free open-weight models.",
  },
  {
    id: "mistral",
    name: "Mistral La Plateforme",
    kind: "openai",
    baseUrl: "https://api.mistral.ai/v1",
    envKey: "MISTRAL_API_KEY",
    model: "open-mistral-nemo",
    priority: 2,
    keyUrl: "https://console.mistral.ai/api-keys",
    freeTier: "Free mode · ~1B tokens/month · no card",
    vision: true, visionModel: "pixtral-12b-2409",
    notes: "Free experiment tier.",
  },
  {
    id: "together",
    name: "Together AI",
    kind: "openai",
    baseUrl: "https://api.together.xyz/v1",
    envKey: "TOGETHER_API_KEY",
    model: "meta-llama/Llama-3.3-70B-Instruct-Turbo-Free",
    priority: 2,
    keyUrl: "https://api.together.ai",
    freeTier: "Free models only (no trial credit now)",
    vision: true, visionModel: "meta-llama/Llama-Vision-Free",
    notes: "Free credit tier for Llama and Qwen.",
  },
  {
    id: "cohere",
    name: "Cohere",
    kind: "cohere",
    baseUrl: "https://api.cohere.com/v2",
    envKey: "COHERE_API_KEY",
    model: "command-r-08-2024",
    priority: 2,
    keyUrl: "https://dashboard.cohere.com/api-keys",
    freeTier: "20 RPM · 1,000 calls/month trial",
    notes: "Command-R; free trial developer key.",
  },
  {
    id: "cloudflare",
    name: "Cloudflare Workers AI",
    kind: "cloudflare",
    baseUrl: "https://api.cloudflare.com/client/v4/accounts",
    envKey: "CLOUDFLARE_API_TOKEN",
    model: "@cf/meta/llama-3.1-8b-instruct",
    priority: 2,
    keyUrl: "https://dash.cloudflare.com/profile/api-tokens",
    freeTier: "10K neurons/day · no card",
    notes: "Edge inference; needs CLOUDFLARE_ACCOUNT_ID too. 10k neurons/day free.",
  },
  {
    id: "huggingface",
    name: "Hugging Face Inference",
    kind: "openai",
    baseUrl: "https://router.huggingface.co/v1",
    envKey: "HF_TOKEN",
    model: "meta-llama/Llama-3.1-8B-Instruct",
    priority: 2,
    keyUrl: "https://huggingface.co/settings/tokens",
    freeTier: "$0.10/month credit · no card",
    notes: "Serverless inference across open-source models; free monthly credits.",
  },

  // ---- Tier 3: credit-based / specialist ---------------------------------------------
  {
    id: "nvidia",
    name: "NVIDIA NIM",
    kind: "openai",
    baseUrl: "https://integrate.api.nvidia.com/v1",
    envKey: "NVIDIA_API_KEY",
    model: "meta/llama-3.1-70b-instruct",
    priority: 3,
    keyUrl: "https://build.nvidia.com/settings/api-keys",
    freeTier: "40 RPM · 1K credits · phone verification",
    vision: true, visionModel: "meta/llama-3.2-90b-vision-instruct",
    notes: "Free developer credits.",
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    kind: "openai",
    baseUrl: "https://api.deepseek.com/v1",
    envKey: "DEEPSEEK_API_KEY",
    model: "deepseek-chat",
    priority: 3,
    keyUrl: "https://platform.deepseek.com/api_keys",
    freeTier: "Granted balance varies",
    notes: "Hyper-cheap; grants for new accounts.",
  },
  {
    id: "ai21",
    name: "AI21 Labs",
    kind: "openai",
    baseUrl: "https://api.ai21.com/studio/v1",
    envKey: "AI21_API_KEY",
    model: "jamba-mini",
    priority: 3,
    keyUrl: "https://studio.ai21.com/account/api-key",
    freeTier: "$10 credit · 3 months",
    notes: "Jamba models; free trial credits.",
  },
  {
    id: "perplexity",
    name: "Perplexity",
    kind: "openai",
    baseUrl: "https://api.perplexity.ai",
    envKey: "PERPLEXITY_API_KEY",
    model: "sonar",
    priority: 4,
    keyUrl: "https://www.perplexity.ai/settings/api",
    freeTier: "Pro subscribers get $5/month credit",
    notes: "Online search-grounded answers. Kept last: intended for explicit web queries.",
  },
  // ---- Tier 0: keyless community endpoints (work out of the box; a key raises limits) ----
  {
    id: "pollinations",
    name: "Pollinations",
    kind: "openai",
    baseUrl: "https://text.pollinations.ai/openai",
    envKey: "POLLINATIONS_API_KEY",
    keyless: true,
    model: "openai",
    priority: 5,
    keyUrl: "https://auth.pollinations.ai",
    freeTier: "Anonymous tier, no key needed · token raises limits",
    notes: "Community gateway (GPT-OSS / OpenAI-class models). Works with zero configuration.",
  },
  {
    id: "llm7",
    name: "LLM7.io",
    kind: "openai",
    baseUrl: "https://api.llm7.io/v1",
    envKey: "LLM7_API_KEY",
    keyless: true,
    model: "gpt-4o-mini",
    priority: 5,
    keyUrl: "https://token.llm7.io",
    freeTier: "30 RPM anonymous · 120 RPM with free token",
    notes: "Free multi-model gateway; no key required for the anonymous tier.",
  },

  // ---- Tier 3: more free-key providers -------------------------------------------------
  {
    id: "modelscope",
    name: "ModelScope",
    kind: "openai",
    baseUrl: "https://api-inference.modelscope.cn/v1",
    envKey: "MODELSCOPE_API_KEY",
    model: "Qwen/Qwen2.5-72B-Instruct",
    priority: 3,
    keyUrl: "https://modelscope.cn/my/myaccesstoken",
    freeTier: "2,000 RPD · 59 free models · no card",
    notes: "Alibaba's model hub; Qwen, DeepSeek, GLM families.",
  },
  {
    id: "ovh",
    name: "OVHcloud AI Endpoints",
    kind: "openai",
    baseUrl: "https://oai.endpoints.kepler.ai.cloud.ovh.net/v1",
    envKey: "OVH_AI_ENDPOINTS_TOKEN",
    model: "Meta-Llama-3_3-70B-Instruct",
    priority: 3,
    keyUrl: "https://www.ovhcloud.com/en/public-cloud/ai-endpoints/catalog/",
    freeTier: "Free beta tier · EU-hosted",
    notes: "European GPU cloud; Llama, Qwen, Mistral.",
  },
  {
    id: "ollama-cloud",
    name: "Ollama Cloud",
    kind: "openai",
    baseUrl: "https://ollama.com/v1",
    envKey: "OLLAMA_API_KEY",
    model: "gpt-oss:20b",
    priority: 3,
    keyUrl: "https://ollama.com/settings/keys",
    freeTier: "Free tier with session/weekly limits",
    notes: "Hosted Ollama; gpt-oss, Kimi, DeepSeek, Qwen.",
  },
  {
    id: "kilo",
    name: "Kilo Code",
    kind: "openai",
    baseUrl: "https://api.kilo.ai/api/gateway",
    envKey: "KILO_API_KEY",
    model: "nvidia/nemotron-3-super-120b-a12b:free",
    priority: 3,
    keyUrl: "https://kilo.ai",
    freeTier: "12 free models · no card",
    notes: "Developer gateway with free frontier open models.",
  },
  {
    id: "zai",
    name: "Z.AI (GLM)",
    kind: "openai",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    envKey: "ZAI_API_KEY",
    model: "glm-4-flash",
    priority: 3,
    keyUrl: "https://open.bigmodel.cn/usercenter/apikeys",
    freeTier: "GLM-4-Flash free · no card",
    notes: "Zhipu's GLM family; Flash models are free.",
  },
  {
    id: "siliconflow",
    name: "SiliconFlow",
    kind: "openai",
    baseUrl: "https://api.siliconflow.cn/v1",
    envKey: "SILICONFLOW_API_KEY",
    model: "Qwen/Qwen2.5-7B-Instruct",
    priority: 3,
    keyUrl: "https://cloud.siliconflow.cn/account/ak",
    freeTier: "Several always-free small models",
    notes: "Qwen/GLM/DeepSeek small models free forever.",
  },
  {
    id: "nebius",
    name: "Nebius AI Studio",
    kind: "openai",
    baseUrl: "https://api.studio.nebius.com/v1",
    envKey: "NEBIUS_API_KEY",
    model: "meta-llama/Meta-Llama-3.1-70B-Instruct",
    priority: 3,
    keyUrl: "https://studio.nebius.com/settings/api-keys",
    freeTier: "Signup credit",
    notes: "Fast open-model inference, EU.",
  },
  {
    id: "chutes",
    name: "Chutes.ai",
    kind: "openai",
    baseUrl: "https://llm.chutes.ai/v1",
    envKey: "CHUTES_API_KEY",
    model: "deepseek-ai/DeepSeek-V3-0324",
    priority: 3,
    keyUrl: "https://chutes.ai",
    freeTier: "Free tier on decentralised compute",
    notes: "Bittensor-backed; DeepSeek, Qwen, Llama.",
  },
  {
    id: "glhf",
    name: "glhf.chat",
    kind: "openai",
    baseUrl: "https://glhf.chat/api/openai/v1",
    envKey: "GLHF_API_KEY",
    model: "hf:meta-llama/Llama-3.3-70B-Instruct",
    priority: 3,
    keyUrl: "https://glhf.chat",
    freeTier: "Free beta",
    notes: "Run any HF open model; prefix ids with hf:.",
  },
  {
    id: "nscale",
    name: "Nscale",
    kind: "openai",
    baseUrl: "https://inference.api.nscale.com/v1",
    envKey: "NSCALE_API_KEY",
    model: "meta-llama/Llama-3.3-70B-Instruct",
    priority: 3,
    keyUrl: "https://console.nscale.com",
    freeTier: "Signup credit",
    notes: "Serverless inference on UK/EU GPUs.",
  },

  // ---- Local / self-hosted (offline-first). Any OpenAI-compatible server works. --------------
  {
    id: "ollama", name: "Ollama (local)", kind: "openai", baseUrl: process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434/v1", envKey: "OLLAMA_LOCAL",
    model: process.env.OLLAMA_MODEL ?? "llama3.1", priority: 0, local: true, costClass: "local", strengths: ["coding", "reasoning"], contextTokens: 32_000,
    keyUrl: "https://ollama.com/download", freeTier: "runs on your machine · unlimited · private",
    notes: "Set OLLAMA_LOCAL=1 (and optionally OLLAMA_BASE_URL / OLLAMA_MODEL). Priority 0 = preferred when reachable.",
  },
  {
    id: "lmstudio", name: "LM Studio (local)", kind: "openai", baseUrl: process.env.LMSTUDIO_BASE_URL ?? "http://127.0.0.1:1234/v1", envKey: "LMSTUDIO_LOCAL",
    model: process.env.LMSTUDIO_MODEL ?? "local-model", priority: 0, local: true, costClass: "local", contextTokens: 32_000,
    keyUrl: "https://lmstudio.ai", freeTier: "runs on your machine · unlimited · private", notes: "Set LMSTUDIO_LOCAL=1.",
  },
  {
    id: "vllm", name: "vLLM / custom OpenAI-compatible", kind: "openai", baseUrl: process.env.CUSTOM_LLM_BASE_URL ?? "http://127.0.0.1:8000/v1", envKey: "CUSTOM_LLM_API_KEY",
    model: process.env.CUSTOM_LLM_MODEL ?? "default", priority: 0, local: !/^https?:\/\/(?!127\.|localhost|10\.|192\.168\.)/.test(process.env.CUSTOM_LLM_BASE_URL ?? ""), costClass: "local", contextTokens: 32_000,
    keyUrl: "https://docs.vllm.ai", freeTier: "self-hosted", notes: "Set CUSTOM_LLM_BASE_URL, CUSTOM_LLM_MODEL and CUSTOM_LLM_API_KEY (any value if the server needs none).",
  },
];

export function providerById(id: string): ProviderConfig | undefined {
  return allProviders().find((p) => p.id === id);
}

/** Built-ins + user-added providers (added by link in Settings). Read on every call, so new
 *  providers appear instantly with no restart. */
export function allProviders(): ProviderConfig[] {
  return [...PROVIDERS, ...listCustomProviders().map(toProviderConfig)];
}

/** Resolve the model for a provider, honouring AETHERIS_MODEL_<ID> overrides. */
export function resolveModel(p: ProviderConfig, opts?: { vision?: boolean }): string {
  if (opts?.vision) {
    const vo = process.env[`AETHERIS_VISION_MODEL_${p.id.toUpperCase()}`];
    if (vo && vo.trim()) return vo.trim();
    if (p.visionModel) return p.visionModel;
  }
  const override = process.env[`AETHERIS_MODEL_${p.id.toUpperCase()}`];
  return override && override.trim() ? override.trim() : p.model;
}

export function isConfigured(p: ProviderConfig): boolean {
  if (p.keyless) return true;
  if (!providerKey(p)) return false;
  if (p.kind === "cloudflare" && !process.env.CLOUDFLARE_ACCOUNT_ID) return false;
  return true;
}

/**
 * API key to send: runtime override (Settings UI) first, then .env, then a placeholder for
 * keyless providers (they ignore it).
 */
export function apiKeyFor(p: ProviderConfig): string {
  const k = providerKey(p);
  return k ?? (p.keyless ? "anonymous" : "");
}

/** Where the active key for a provider comes from — "app" (runtime store) or "env" (.env). */
export type ProviderKeySource = "app" | "env";

/** Resolved key for a provider: in-app runtime override first, then the environment. */
export function providerKey(p: ProviderConfig): string | undefined {
  return resolvedEnv(p.envKey);
}

export function providerKeySource(p: ProviderConfig): ProviderKeySource | undefined {
  if (runtimeKeyFor(p.envKey)) return "app";
  const e = process.env[p.envKey];
  return e && e.trim() ? "env" : undefined;
}
