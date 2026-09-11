import { NextResponse } from "next/server";
import { getUserId, uidCookie } from "@/aetheris/lib/user";
import { allProviders, resolveModel, type ProviderKeySource } from "@/aetheris/lib/router/providers";
import { hydrateRouterStores } from "@/aetheris/lib/router/hydrate";
import { setRuntimeKeyAsync, runtimeKeyFor } from "@/aetheris/lib/router/runtimeKeys";
import { maskKey } from "@/aetheris/lib/router/router";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET/PUT/DELETE /api/providers/keys — manage every service API key from the Settings UI
 * instead of .env:
 *   • `providers` — chat-model providers (mesh candidates from src/lib/router/providers.ts)
 *   • `services`  — the other keys .env.example used to own: search (Tavily), Studio media
 *                    (Hugging Face, Fal.ai, ElevenLabs, Luma, Runway), email (Resend),
 *                    knowledge embeddings and custom speech-to-text.
 * Keys are stored instance-wide in <dataDir>/runtime_keys.json (mode 0600) and apply
 * immediately — no restart. A runtime key overrides the same env var from .env; removing it
 * transparently falls back to .env.
 *
 * Not managed here on purpose: OAuth client secrets (Google/GitHub), SMS gateways
 * (Twilio/MSG91), AETHERIS_SECRET / CRON_SECRET / AETHERIS_ADMIN_KEY. Those gate sign-in and
 * admin access, not model usage, and stay in .env.
 */

export interface KeyEntryView {
  id: string;
  name: string;
  /** "chat-model" | "service" | media kind — used only for grouping in the UI. */
  group: "models" | "service";
  kind: string;
  envKey: string;
  /** Default model for model providers, or what this key powers for services. */
  model?: string;
  powers?: string;
  keyless: boolean;
  local: boolean;
  vision: boolean;
  costClass: string;
  keyUrl?: string;
  freeTier?: string;
  notes?: string;
  hasKey: boolean;
  source: ProviderKeySource | null;
  maskedKey: string | null;
  custom?: boolean;
  baseUrl?: string;
  cloudflare: boolean;
  cloudflareAccountSet: boolean;
}

/** Non-model service keys (things .env.example documented that the UI now manages). */
type ServiceDef = Omit<KeyEntryView, "hasKey" | "source" | "maskedKey" | "cloudflare" | "cloudflareAccountSet" | "local" | "keyless" | "vision" | "costClass">;
const SERVICES: ServiceDef[] = [
  { id: "tavily", name: "Tavily", group: "service", kind: "search", envKey: "TAVILY_API_KEY", powers: "Web search · citations · Deep Research", keyUrl: "https://app.tavily.com", freeTier: "1,000 free searches / month", notes: "Powers 🌐 chat search, the Research engine and RAVANA web.search." },
  { id: "resend", name: "Resend", group: "service", kind: "email", envKey: "RESEND_API_KEY", powers: "Email delivery · auth codes · schedules & automations", keyUrl: "https://resend.com/api-keys", freeTier: "3,000 emails / month", notes: "Sends sign-in codes, scheduled-run reports and automation emails." },
  { id: "hf", name: "Hugging Face", group: "service", kind: "media", envKey: "HF_TOKEN", powers: "Studio: FLUX.1 images · Kokoro TTS", keyUrl: "https://huggingface.co/settings/tokens", freeTier: "Free monthly inference credits", notes: "One token unlocks image generation and open-weights speech." },
  { id: "fal", name: "Fal.ai", group: "service", kind: "media", envKey: "FAL_KEY", powers: "Studio: FLUX.1-schnell images", keyUrl: "https://fal.ai/dashboard/keys", freeTier: "Free trial credits", notes: "Fast image generation used by Studio." },
  { id: "elevenlabs", name: "ElevenLabs", group: "service", kind: "media", envKey: "ELEVENLABS_API_KEY", powers: "Studio: lifelike speech", keyUrl: "https://elevenlabs.io/app/settings/api-keys", freeTier: "10k chars / month", notes: "Highest-fidelity TTS voices in Studio." },
  { id: "luma", name: "Luma Dream Machine", group: "service", kind: "media", envKey: "LUMA_API_KEY", powers: "Studio: text / image to video", keyUrl: "https://lumalabs.ai/dream-machine/api", notes: "Bring your own key for video generation." },
  { id: "runway", name: "Runway Gen-3", group: "service", kind: "media", envKey: "RUNWAY_API_KEY", powers: "Studio: Gen-3 Alpha Turbo video", keyUrl: "https://dev.runwayml.com", notes: "Bring your own key for video generation." },
  { id: "embeddings", name: "Semantic embeddings", group: "service", kind: "knowledge", envKey: "EMBEDDINGS_KEY", powers: "Vector memory & knowledge search", notes: "Also set EMBEDDINGS_URL (optionally EMBEDDINGS_MODEL) in .env — this key alone doesn't activate embeddings." },
  { id: "stt-custom", name: "Custom speech-to-text", group: "service", kind: "speech", envKey: "STT_KEY", powers: "Voice input through your own STT gateway", notes: "Used only when STT_URL is also configured in .env. Without one, GROQ_API_KEY powers voice." },
];

function live(key: string): { hasKey: boolean; source: ProviderKeySource | null; maskedKey: string | null } {
  const app = runtimeKeyFor(key);
  const env = process.env[key]?.trim();
  return { hasKey: !!(app || env), source: app ? "app" : env ? "env" : null, maskedKey: maskKey(app ?? env) };
}

function viewForService(s: ServiceDef): KeyEntryView {
  return { ...s, keyless: false, local: false, vision: false, costClass: "service", ...live(s.envKey), cloudflare: false, cloudflareAccountSet: true };
}

function viewForProviderId(id: string): KeyEntryView | null {
  const p = allProviders().find((x) => x.id === id);
  if (!p) return null;
  return {
    id: p.id, name: p.name, group: "models", kind: p.kind, envKey: p.envKey,
    model: resolveModel(p), keyless: !!p.keyless, local: !!p.local, vision: !!p.vision,
    costClass: p.costClass ?? "free", keyUrl: p.keyUrl, freeTier: p.freeTier, notes: p.notes,
    custom: !!p.custom,
    baseUrl: p.baseUrl,
    ...live(p.envKey),
    cloudflare: p.kind === "cloudflare", cloudflareAccountSet: !!process.env.CLOUDFLARE_ACCOUNT_ID?.trim(),
  };
}

function entryById(id: string): KeyEntryView | null {
  const p = viewForProviderId(id);
  if (p) return p;
  const s = SERVICES.find((x) => x.id === id);
  return s ? viewForService(s) : null;
}

export async function GET() {
  const { uid, isNew } = await getUserId();
  await hydrateRouterStores(true); // hosted: read fresh cross-instance state before rendering
  const providers = allProviders().map((p) => viewForProviderId(p.id)!);
  const services = SERVICES.map(viewForService);
  const res = NextResponse.json({ providers, services });
  if (isNew) {
    const c = uidCookie(uid);
    res.headers.append("Set-Cookie", `${c.name}=${c.value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${c.maxAge}`);
  }
  return res;
}

export async function PUT(req: Request) {
  await getUserId();
  await hydrateRouterStores(true); // hosted: custom providers resolve from a fresh cache
  const body = (await req.json().catch(() => ({}))) as { id?: string; key?: string };
  const id = typeof body.id === "string" ? body.id.trim() : "";
  const key = typeof body.key === "string" ? body.key.trim() : "";
  const found = entryById(id);
  if (!found) return NextResponse.json({ error: `unknown provider "${id}"` }, { status: 404 });
  if (key.length < 6) return NextResponse.json({ error: "key looks too short to be valid" }, { status: 400 });
  await setRuntimeKeyAsync(found.envKey, key);
  return NextResponse.json({ ok: true, item: entryById(id)! }); // fresh state after the write
}

export async function DELETE(req: Request) {
  await getUserId();
  await hydrateRouterStores(true); // hosted: custom providers resolve from a fresh cache
  const body = (await req.json().catch(() => ({}))) as { id?: string };
  const id = typeof body.id === "string" ? body.id.trim() : "";
  const found = entryById(id);
  if (!found) return NextResponse.json({ error: `unknown provider "${id}"` }, { status: 404 });
  if (runtimeKeyFor(found.envKey)) await setRuntimeKeyAsync(found.envKey, "");
  return NextResponse.json({ ok: true, item: entryById(id)! }); // fresh state after the write
}

