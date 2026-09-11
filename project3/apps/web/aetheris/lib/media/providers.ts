import { MediaError, type MediaKind, type MediaProviderConfig } from "./types";

export const MEDIA_PROVIDERS: MediaProviderConfig[] = [
  // ---- Image -----------------------------------------------------------------------------
  { id: "hf-flux", name: "Hugging Face · FLUX.1-schnell", kind: "image", envKey: "HF_TOKEN", priority: 1, notes: "Free monthly inference credits." },
  { id: "fal-flux", name: "Fal.ai · FLUX.1-schnell", kind: "image", envKey: "FAL_KEY", priority: 1, byok: true, notes: "Free trial credits; ~1s generations." },
  { id: "cf-sdxl", name: "Cloudflare Workers AI · SDXL Lightning", kind: "image", envKey: "CLOUDFLARE_API_TOKEN", priority: 2, notes: "Free edge tier." },
  // ---- Audio (TTS) ---------------------------------------------------------------------
  { id: "elevenlabs", name: "ElevenLabs", kind: "audio", envKey: "ELEVENLABS_API_KEY", priority: 1, byok: true, notes: "Free tier 10k chars/month." },
  { id: "hf-kokoro", name: "Hugging Face Space · Kokoro TTS", kind: "audio", envKey: "HF_TOKEN", priority: 2, notes: "Open-weights TTS via Space API." },
  // ---- Video (Pro) -----------------------------------------------------------------------
  { id: "luma", name: "Luma Dream Machine", kind: "video", envKey: "LUMA_API_KEY", priority: 1, byok: true, notes: "Bring your own key." },
  { id: "runway", name: "Runway Gen-3 Alpha Turbo", kind: "video", envKey: "RUNWAY_API_KEY", priority: 2, byok: true, notes: "Bring your own key." },
];

export function mediaProviders(kind: MediaKind) {
  return MEDIA_PROVIDERS.filter((p) => p.kind === kind).sort((a, b) => a.priority - b.priority);
}

export interface Gen {
  prompt: string;
  apiKey: string;
  signal?: AbortSignal;
  /** audio only */
  voice?: string;
}

async function ok(res: Response, name: string) {
  if (res.ok) return;
  let d = "";
  try { d = (await res.text()).slice(0, 200); } catch { /* ignore */ }
  throw new MediaError(`${name} → ${res.status}${d ? `: ${d}` : ""}`, res.status);
}

async function toDataUrl(res: Response, fallbackMime: string) {
  const mime = res.headers.get("content-type")?.split(";")[0] || fallbackMime;
  const b64 = Buffer.from(await res.arrayBuffer()).toString("base64");
  return { url: `data:${mime};base64,${b64}`, mime };
}

// ---- Image adapters ---------------------------------------------------------------------
async function hfFlux(g: Gen) {
  const res = await fetch("https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-schnell", {
    method: "POST",
    headers: { Authorization: `Bearer ${g.apiKey}`, "Content-Type": "application/json", Accept: "image/png" },
    body: JSON.stringify({ inputs: g.prompt, parameters: { num_inference_steps: 4 } }),
    signal: g.signal,
  });
  await ok(res, "Hugging Face");
  return toDataUrl(res, "image/png");
}

async function falFlux(g: Gen) {
  const res = await fetch("https://fal.run/fal-ai/flux/schnell", {
    method: "POST",
    headers: { Authorization: `Key ${g.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: g.prompt, image_size: "square_hd", num_images: 1 }),
    signal: g.signal,
  });
  await ok(res, "Fal.ai");
  const j = (await res.json()) as { images?: { url: string; content_type?: string }[] };
  const img = j.images?.[0];
  if (!img) throw new MediaError("Fal.ai returned no image");
  return { url: img.url, mime: img.content_type ?? "image/jpeg" };
}

async function cfSdxl(g: Gen) {
  const acct = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!acct) throw new MediaError("CLOUDFLARE_ACCOUNT_ID not set");
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${acct}/ai/run/@cf/bytedance/stable-diffusion-xl-lightning`, {
    method: "POST",
    headers: { Authorization: `Bearer ${g.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: g.prompt }),
    signal: g.signal,
  });
  await ok(res, "Cloudflare");
  return toDataUrl(res, "image/png");
}

// ---- Audio adapters ---------------------------------------------------------------------
async function elevenlabs(g: Gen) {
  const voice = g.voice || process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM"; // "Rachel"
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}`, {
    method: "POST",
    headers: { "xi-api-key": g.apiKey, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({ text: g.prompt, model_id: "eleven_turbo_v2_5" }),
    signal: g.signal,
  });
  await ok(res, "ElevenLabs");
  return toDataUrl(res, "audio/mpeg");
}

async function hfKokoro(g: Gen) {
  // Gradio Space API (hexgrad/Kokoro-TTS). Two-step: POST event → GET result stream.
  const base = process.env.KOKORO_SPACE_URL ?? "https://hexgrad-kokoro-tts.hf.space";
  const headers = { Authorization: `Bearer ${g.apiKey}`, "Content-Type": "application/json" };
  const start = await fetch(`${base}/gradio_api/call/generate_first`, {
    method: "POST", headers, signal: g.signal,
    body: JSON.stringify({ data: [g.prompt, g.voice || "af_heart", 1, false] }),
  });
  await ok(start, "Kokoro Space");
  const { event_id } = (await start.json()) as { event_id: string };
  const out = await fetch(`${base}/gradio_api/call/generate_first/${event_id}`, { headers, signal: g.signal });
  await ok(out, "Kokoro Space");
  const text = await out.text();
  const dataLine = text.split("\n").reverse().find((l) => l.startsWith("data: "));
  if (!dataLine) throw new MediaError("Kokoro Space returned no data");
  const data = JSON.parse(dataLine.slice(6)) as { url?: string }[];
  const url = data?.[0]?.url;
  if (!url) throw new MediaError("Kokoro Space returned no audio URL");
  const audio = await fetch(url, { signal: g.signal });
  await ok(audio, "Kokoro Space");
  return toDataUrl(audio, "audio/wav");
}

// ---- Video adapters (async: submit, poll) -------------------------------------------------
async function poll<T>(fn: () => Promise<T | null>, signal?: AbortSignal, timeoutMs = 5 * 60_000): Promise<T> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (signal?.aborted) throw new MediaError("aborted");
    const r = await fn();
    if (r) return r;
    await new Promise((res) => setTimeout(res, 5000));
  }
  throw new MediaError("Video generation timed out");
}

async function luma(g: Gen) {
  const h = { Authorization: `Bearer ${g.apiKey}`, "Content-Type": "application/json", Accept: "application/json" };
  const res = await fetch("https://api.lumalabs.ai/dream-machine/v1/generations", {
    method: "POST", headers: h, signal: g.signal,
    body: JSON.stringify({ prompt: g.prompt, model: "ray-2", resolution: "540p", duration: "5s" }),
  });
  await ok(res, "Luma");
  const { id } = (await res.json()) as { id: string };
  const url = await poll(async () => {
    const r = await fetch(`https://api.lumalabs.ai/dream-machine/v1/generations/${id}`, { headers: h, signal: g.signal });
    await ok(r, "Luma");
    const j = (await r.json()) as { state: string; failure_reason?: string; assets?: { video?: string } };
    if (j.state === "failed") throw new MediaError(`Luma failed: ${j.failure_reason ?? "unknown"}`);
    return j.state === "completed" ? j.assets?.video ?? null : null;
  }, g.signal);
  return { url, mime: "video/mp4" };
}

async function runway(g: Gen) {
  const h = { Authorization: `Bearer ${g.apiKey}`, "Content-Type": "application/json", "X-Runway-Version": "2024-11-06" };
  const res = await fetch("https://api.dev.runwayml.com/v1/text_to_video", {
    method: "POST", headers: h, signal: g.signal,
    body: JSON.stringify({ promptText: g.prompt, model: "gen3a_turbo", duration: 5, ratio: "1280:720" }),
  });
  await ok(res, "Runway");
  const { id } = (await res.json()) as { id: string };
  const url = await poll(async () => {
    const r = await fetch(`https://api.dev.runwayml.com/v1/tasks/${id}`, { headers: h, signal: g.signal });
    await ok(r, "Runway");
    const j = (await r.json()) as { status: string; failure?: string; output?: string[] };
    if (j.status === "FAILED") throw new MediaError(`Runway failed: ${j.failure ?? "unknown"}`);
    return j.status === "SUCCEEDED" ? j.output?.[0] ?? null : null;
  }, g.signal);
  return { url, mime: "video/mp4" };
}

export const ADAPTERS: Record<string, (g: Gen) => Promise<{ url: string; mime: string }>> = {
  "hf-flux": hfFlux,
  "fal-flux": falFlux,
  "cf-sdxl": cfSdxl,
  elevenlabs,
  "hf-kokoro": hfKokoro,
  luma,
  runway,
};
