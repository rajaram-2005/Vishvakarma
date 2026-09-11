/**
 * Provider / connector branding — monogram glyph + brand colour.
 *
 * Ships no image files and fetches nothing: every entity gets a crisp two-letter monogram on a
 * tinted brand-colour tile (like the big apps do). Curated colours approximate the real brands;
 * anything unlisted falls back to a stable hue derived from its id, so every provider, service,
 * connector and custom endpoint still looks intentional.
 *
 * Client-safe (no node imports) so any component can use it.
 */

/** Curated brand colours (approximations of the real logos). */
const BRAND_COLORS: Record<string, string> = {
  // ---- chat model providers ----
  groq: "#f55036", cerebras: "#0bb8c8", sambanova: "#e8212b", gemini: "#4285f4",
  github: "#8957e5", openrouter: "#ff6b2c", mistral: "#f97316", together: "#7c3aed",
  cohere: "#39594d", cloudflare: "#f6821f", huggingface: "#ffd21e", modelscope: "#6236ff",
  ovh: "#1230f0", ollama: "#7b7b7b", lmstudio: "#f4b400", vllm: "#0ea5e9",
  kilo: "#ef4444", zai: "#1e6fff", siliconflow: "#22c55e", nebius: "#0b84ff",
  chutes: "#a78bfa", glhf: "#eab308", nscale: "#38bdf8", nvidia: "#76b900",
  deepseek: "#4d6bfe", ai21: "#f59e0b", perplexity: "#20b8cd", pollinations: "#00c9a7", llm7: "#8b5cf6",
  // ---- local server templates ----
  "llama.cpp": "#8f4b2e", "koboldcpp": "#d97706", "localai": "#10b981", jan: "#6366f1",
  // ---- services ----
  tavily: "#ff7a45", resend: "#ff4d4d", fal: "#3b82f6", elevenlabs: "#8b5cf6",
  luma: "#06b6d4", runway: "#a855f7", embeddings: "#14b8a6", "stt-custom": "#64748b",
  // ---- popular MCP connectors & third parties ----
  github2: "#6e40c9", notion: "#111827", slack: "#611f69", linear: "#5e6ad2",
  figma: "#a259ff", stripe: "#635bff", salesforce: "#00a1e0", hubspot: "#ff7a59",
  jira: "#2684ff", confluence: "#172b4d", trello: "#0079bf", discord: "#5865f2",
  telegram: "#229ed9", reddit: "#ff4500", youtube: "#ff0000", spotify: "#1db954",
  drive: "#1a73e8", dropbox: "#0061ff", box: "#0061d5", supabase: "#3ecf8e",
  mongodb: "#47a248", aws: "#ff9900", azure: "#0078d4", google: "#4285f4",
  anthropic: "#d97757", openai: "#10a37f", xai: "#b8b8b8", meta: "#0866ff",
  qwen: "#6d28d9", "deepseek-ai": "#4d6bfe", gmail: "#ea4335", outlook: "#0078d4",
  whatsapp: "#25d366", twilio: "#f22f46", sendgrid: "#1a82e2", mailgun: "#f06b66",
  postgres: "#336791", mysql: "#4479a1", redis: "#dc382d", kafka: "#231f20",
  vercel: "#8a8a8a", netlify: "#00c7b7", render: "#46e3b7", fly: "#7d3ff2",
  digitalocean: "#0080ff", cloudinary: "#3448c5", s3: "#e47911", lambda: "#f90c0c",
  notion2: "#f5f5f4", x: "#e5e5e5", twitter: "#1d9bf0", facebook: "#1877f2",
  instagram: "#e4405f", tiktok: "#22d3ee", linkedin: "#0a66c2", pinterest: "#e60023",
  medium: "#7a7a7a", wordpress: "#21759b", shopify: "#95bf47", woocommerce: "#96588a",
  magento: "#eb5202", square: "#2d9bf0", paypal: "#003087", razorpay: "#0a2540",
  gpay: "#4285f4", phonepay: "#5f259f", stripe2: "#635bff", coinbase: "#0052ff",
  binance: "#f0b90b", okx: "#1a1a1a", kraken: "#5841d8", webhook: "#94a3b8",
  zapier: "#ff4f00", make: "#6d00cc", n8n: "#ea4b71", ifttt: "#00a8ff",
  clickup: "#7b68ee", asana: "#f06a6a", monday: "#f62b54", basecamp: "#1d6d5f",
  "airtable": "#fcb400", coda: "#f74843", googlecalendar: "#34a853", googledocs: "#4285f4",
  googlesheets: "#0f9d58", googleslides: "#fbbc04", googlemeet: "#00897b", zoom: "#2d8cff",
  teams: "#6264a7", skype: "#00aff0", voiceflow: "#3b82f6", dialogflow: "#ffc400",
  awsbedrock: "#ff9900", awslex: "#f90c0c", vertex: "#4285f4", sagemaker: "#f90c0c",
  replicate: "#fb4a4a", modal: "#00be63", baseten: "#6f61f2", gradio: "#f97316",
  kaggle: "#20beff", coursera: "#0056d2", udemy: "#ec5252", moodle: "#f98012",
  canvas: "#e72429", blackboard: "#0b2f52", chess: "#7fa650", lichess: "#333333",
};

/** Categories → accent colour when nothing specific is known. */
const CATEGORY_COLORS: Record<string, string> = {
  productivity: "#6366f1", dev: "#0ea5e9", payments: "#10b981", communication: "#8b5cf6",
  design: "#ec4899", data: "#f59e0b", web: "#06b6d4", crm: "#f43f5e",
  social: "#e879f9", storage: "#84cc16", models: "#f97316", service: "#14b8a6",
  media: "#a855f7", search: "#ff7a45", email: "#ef4444", knowledge: "#14b8a6",
  speech: "#64748b", chat: "#8b5cf6", local: "#22c55e", system: "#64748b",
  agents: "#3b82f6", tools: "#0ea5e9", home: "#f97316", character: "#ec4899",
};

/** Stable fallback hue from any string. */
export function hueFor(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h % 360;
}

export interface Brand {
  /** 1–2 letter monogram shown on the tile. */
  glyph: string;
  /** Brand colour (hex). */
  color: string;
}

/** Two-letter monogram: initials of the first two significant words. */
export function monogramFor(name: string): string {
  const words = name
    .split(/[^A-Za-z0-9]+/)
    .filter((w) => w.length > 0)
    .filter((w, i) => !(i === 0 && /^(the|a|an)$/i.test(w)));
  const pick = (w: string) => w[0]!.toUpperCase();
  if (words.length === 0) return "AI";
  if (words.length === 1) return pick(words[0]!);
  const first = pick(words[0]!);
  // Skip boilerplate second words that make monograms silly.
  const skip = new Set(["AI", "API", "CLOUD", "LABS", "INC", "TECH", "IO", "APP", "APPS", "HUB", "MODELS"]);
  let second = "";
  for (let i = 1; i < words.length; i++) {
    const w = words[i]!.toUpperCase();
    if (skip.has(w) || w.length <= 2) continue;
    second = pick(words[i]!);
    break;
  }
  if (!second) second = words[words.length - 1]![0]!.toUpperCase();
  return second === first ? first : first + second;
}

/** Brand for an entity: explicit colour by id (fallback: category colour, then id-hash hue). */
export function brandFor(id: string, name: string, category?: string): Brand {
  const color =
    BRAND_COLORS[id] ??
    BRAND_COLORS[name] ??
    (category ? CATEGORY_COLORS[category] ?? CATEGORY_COLORS[name.toLowerCase()] : undefined) ??
    `hsl(${hueFor(id)} 62% 58%)`;
  return { glyph: monogramFor(name), color };
}
