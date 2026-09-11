/**
 * Multimodal Perception (Phase 11) — one typed entry point: perceive(input) → Perception.
 *
 *   image      vision LLM via the model router (Groq/Gemini/OpenRouter/... vision-capable)       IMPLEMENTED
 *   document   PDF/DOCX/CSV/HTML/text extraction (existing KB extractor) + summary                 IMPLEMENTED
 *   audio      speech-to-text via OpenAI-compatible /audio/transcriptions (Groq whisper-large-v3    IMPLEMENTED
 *              free tier, or STT_URL/STT_KEY); no local model → honest NOT AVAILABLE without a key
 *   video      three paths, chosen by what the host/provider actually has, and reported per call:   IMPLEMENTED
 *                1. ffmpeg installed        → frame sampling + vision, plus the audio track if any
 *                2. no ffmpeg, but a video-native model (GEMINI_API_KEY) → the file goes to the model
 *                   inline; ffmpeg is not required for video understanding
 *                3. neither                 → the container is still read in-process (pure JS):
 *                   duration, resolution, codec, rotation, creation time, track layout, cover art.
 *                   That is real data about the video, but it is not frame-level understanding, and
 *                   the result says so (`frames: 0`).
 *   sensor     numeric time-series → statistics, anomalies (z-score), trend; LLM narrative optional  IMPLEMENTED
 *
 * Generation (image/audio/video) already lives in src/lib/media. Outputs never fake: if no capable
 * provider exists the result carries ok:false and a reason.
 */
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { hydrateRouterStores } from "@/aetheris/lib/router/hydrate";
import { route } from "@/aetheris/lib/router/router";
import { extractText } from "@/aetheris/lib/kb";
import { allProviders, isConfigured } from "@/aetheris/lib/router/providers";
import { resolvedEnv } from "@/aetheris/lib/router/runtimeKeys";
import { readContainer, describeContainer } from "./container";
import { sampleFramesWithWasm, wasmFfmpegAvailable, wasmFfmpegReason, wasmFfmpegVersion } from "./wasmffmpeg";
import { record, traced } from "../observability/events";

const run = promisify(execFile);
export type Modality = "image" | "document" | "audio" | "video" | "sensor";
export interface PerceiveInput { modality: Modality; data?: Buffer; url?: string; name?: string; mime?: string; question?: string; series?: { t: number; v: number }[]; preferred?: string }
export interface Perception { ok: boolean; modality: Modality; text: string; structured?: Record<string, unknown>; provider?: string; model?: string; ms: number; reason?: string }

async function which(bin: string) { try { await run("which", [bin]); return true; } catch { return false; } }
/** Providers that take video inline — the path that makes video work without ffmpeg. */
const videoProviders = () => allProviders().filter((p) => p.video && isConfigured(p)).map((p) => p.id);
const visionProviders = () => allProviders().filter((p) => p.vision && isConfigured(p)).map((p) => p.id);
export async function status() {
  const vision = visionProviders();
  const stt = process.env.STT_URL && process.env.STT_KEY ? "custom STT_URL" : process.env.GROQ_API_KEY ? "groq whisper-large-v3" : undefined;
  const ffmpeg = await which("ffmpeg");
  const wasm = wasmFfmpegAvailable();
  const wasmVersion = wasm ? await wasmFfmpegVersion() : null;
  const nativeVideo = videoProviders();
  return {
    image: { available: vision.length > 0, providers: vision },
    document: { available: true, formats: "pdf docx csv html txt md code" },
    audio: { available: !!stt, via: stt ?? "set GROQ_API_KEY (free) or STT_URL/STT_KEY" },
    video: {
      // Always available: the container is read in-process. Frame-level understanding needs one of
      // the two paths below, and which one is live on this host is reported rather than assumed.
      available: true,
      framesVia: ffmpeg && vision.length > 0 ? "ffmpeg" : wasm && vision.length > 0 ? `ffmpeg-wasm ${wasmVersion ?? ""}`.trim() : nativeVideo.length > 0 ? `provider (${nativeVideo.join(", ")})` : "none — container facts only",
      ffmpeg,
      // The WASM core installs from the npm registry, so frame sampling works with no host binary.
      wasm,
      wasmVersion,
      wasmReason: wasm ? undefined : wasmFfmpegReason(),
      inlineVideoProviders: nativeVideo,
      needs: vision.length > 0 && (ffmpeg || wasm) ? "nothing — frame sampling is available" : "a vision-capable provider key, or a video-native model key (GEMINI_API_KEY) for inline video",
    },
    sensor: { available: true },
  };
}

/** Pure sensor analytics: stats, linear trend, z-score anomalies (tested). */
export function analyzeSeries(series: { t: number; v: number }[], z = 3) {
  const n = series.length; if (!n) return { n: 0 };
  const vs = series.map((s) => s.v); const mean = vs.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(vs.reduce((a, b) => a + (b - mean) ** 2, 0) / n) || 0;
  const xs = series.map((s) => s.t); const mx = xs.reduce((a, b) => a + b, 0) / n;
  const slope = xs.reduce((a, x, i) => a + (x - mx) * (vs[i] - mean), 0) / (xs.reduce((a, x) => a + (x - mx) ** 2, 0) || 1);
  const anomalies = series.filter((s) => sd > 0 && Math.abs(s.v - mean) / sd >= z);
  return { n, min: Math.min(...vs), max: Math.max(...vs), mean, sd, slopePerUnit: slope, trend: Math.abs(slope) * (xs[n - 1] - xs[0]) <= Math.max(sd * 0.5, 1e-9) ? "flat" : slope > 0 ? "rising" : "falling", anomalies, first: series[0], last: series[n - 1] };
}

/**
 * Telemetry for the video-path decision (capability `multimodal:video-path` in /api/telemetry):
 * which of the five video strategies handled the file — ffmpeg binary, ffmpeg-wasm,
 * provider-inline, embedded-cover-art, or container-metadata — and why. This is what makes
 * "video works on this host" diagnosable without reproducing the request.
 */
function noteVideoPath(via: string, detail: string, ok = true) {
  record({ type: "tool", capability: "multimodal:video-path", ok, detail: `via=${via} ${detail}`.slice(0, 300) });
}

export async function perceive(input: PerceiveInput): Promise<Perception> {
  await hydrateRouterStores(); // hosted: refresh runtime keys (TTL-gated; no-op on files)
  return traced({ type: "tool", capability: `multimodal:${input.modality}` }, async () => {
    const t0 = Date.now(); const done = (p: Omit<Perception, "ms" | "modality">): Perception => ({ ...p, modality: input.modality, ms: Date.now() - t0 });
    try {
      switch (input.modality) {
        case "image": {
          const img = input.url ?? (input.data ? `data:${input.mime ?? "image/png"};base64,${input.data.toString("base64")}` : undefined);
          if (!img) return done({ ok: false, text: "", reason: "image data or url required" });
          const r = await route({ preferred: input.preferred, temperature: 0.1, maxTokens: 900, messages: [{ role: "system", content: "You are a precise visual analyst. Describe what is in the image, read any text verbatim, list objects/counts, note safety-relevant details. If asked a question, answer it first." }, { role: "user", content: input.question ?? "Describe this image in detail.", images: [img] }] });
          return done({ ok: true, text: r.content, provider: r.provider, model: r.model });
        }
        case "document": {
          if (!input.data) return done({ ok: false, text: "", reason: "document bytes required" });
          const ex = await extractText(input.name ?? "file", input.mime ?? "application/octet-stream", input.data);
          const excerpt = ex.text.slice(0, 24_000);
          if (!input.question && excerpt.length < 4000) return done({ ok: true, text: excerpt, structured: { kind: ex.kind, chars: ex.text.length, pages: ex.pages?.length } });
          const r = await route({ preferred: input.preferred, temperature: 0.1, maxTokens: 1200, messages: [{ role: "system", content: "Summarise the document faithfully: purpose, key points, entities, numbers, dates, action items. Answer the question if given. Quote when precise." }, { role: "user", content: `${input.question ? `Question: ${input.question}\n\n` : ""}Document (${ex.kind}, ${ex.text.length} chars${ex.text.length > excerpt.length ? ", truncated" : ""}):\n${excerpt}` }] });
          return done({ ok: true, text: r.content, structured: { kind: ex.kind, chars: ex.text.length, pages: ex.pages?.length }, provider: r.provider, model: r.model });
        }
        case "audio": {
          if (!input.data) return done({ ok: false, text: "", reason: "audio bytes required" });
          const tr = await transcribe(input.data, input.name ?? "audio.webm", input.mime);
          if (!tr.ok) return done({ ok: false, text: "", reason: tr.reason });
          if (!input.question) return done({ ok: true, text: tr.text, provider: tr.provider, model: tr.model, structured: { language: tr.language } });
          const r = await route({ preferred: input.preferred, temperature: 0.2, maxTokens: 800, messages: [{ role: "system", content: "Answer using the transcript only." }, { role: "user", content: `Question: ${input.question}\n\nTranscript:\n${tr.text.slice(0, 20_000)}` }] });
          return done({ ok: true, text: r.content, structured: { transcript: tr.text, language: tr.language }, provider: r.provider, model: r.model });
        }
        case "video": {
          if (!input.data) return done({ ok: false, text: "", reason: "video bytes required" });
          const ffmpeg = await which("ffmpeg");
          const container = readContainer(input.data);
          const facts = describeContainer(container);
          const inline = videoProviders();

          // Path 2 (no ffmpeg): a video-native model takes the file inline. No host binary needed.
          if (!ffmpeg && inline.length > 0 && !input.series) {
            const mime = input.mime ?? "video/mp4";
            const r = await route({ preferred: input.preferred, temperature: 0.1, maxTokens: 1000, messages: [{ role: "system", content: "You are given a video file directly. Describe what happens over time, read any on-screen text verbatim, and answer the question if given. If the video is silent or has no useful content, say so instead of inventing it." }, { role: "user", content: `${input.question ?? "What happens in this video?"}\n\nContainer facts read on the server (for orientation, do not repeat them unless asked): ${facts}`, images: [`data:${mime};base64,${input.data.toString("base64")}`] }] });
            noteVideoPath("provider-inline-video", `provider=${r.provider} model=${r.model}`);
            return done({ ok: true, text: r.content, structured: { frames: 0, via: "provider-inline-video", container: container.ok ? container : undefined, containerFacts: facts }, provider: r.provider, model: r.model });
          }

          // Path 1: ffmpeg — sample frames, plus the audio track when there is one.
          if (ffmpeg) {
            const dir = await mkdtemp(path.join(tmpdir(), "aeth-v-")); const src = path.join(dir, input.name?.replace(/[^\w.]/g, "_") ?? "in.mp4");
            try {
              await writeFile(src, input.data);
              await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-i", src, "-vf", "fps=1/5,scale=768:-1", "-frames:v", "6", path.join(dir, "f%02d.jpg")], { timeout: 60_000 });
              const frames: string[] = []; for (let i = 1; i <= 6; i++) { try { frames.push(`data:image/jpeg;base64,${(await readFile(path.join(dir, `f${String(i).padStart(2, "0")}.jpg`))).toString("base64")}`); } catch { break; } }
              if (!frames.length) { noteVideoPath("ffmpeg", "no frames extracted", false); return done({ ok: false, text: "", reason: `no frames extracted — ${facts}` }); }
              let transcript = ""; try { await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-i", src, "-vn", "-ac", "1", "-ar", "16000", path.join(dir, "a.mp3")], { timeout: 60_000 }); const tr = await transcribe(await readFile(path.join(dir, "a.mp3")), "a.mp3", "audio/mpeg"); if (tr.ok) transcript = tr.text; } catch { /* no audio track or STT */ }
              const r = await route({ preferred: input.preferred, temperature: 0.1, maxTokens: 1000, messages: [{ role: "system", content: "You see frames sampled every 5 seconds from a video (in order) and an optional transcript. Describe what happens over time; answer the question if given." }, { role: "user", content: `${input.question ?? "What happens in this video?"}${transcript ? `\n\nTranscript:\n${transcript.slice(0, 8000)}` : ""}`, images: frames }] });
              noteVideoPath("ffmpeg", `frames=${frames.length} transcript=${transcript ? "yes" : "no"}`);
              return done({ ok: true, text: r.content, structured: { frames: frames.length, via: "ffmpeg", transcript: transcript || undefined, container: container.ok ? container : undefined }, provider: r.provider, model: r.model });
            } catch (e) { noteVideoPath("ffmpeg", `exec failed: ${(e as Error).message}`.slice(0, 160), false); throw e; } finally { await rm(dir, { recursive: true, force: true }); }
          }

          // Path 1b: no ffmpeg binary, but the WASM core is installed. Same frame sampling, no host
          // dependency — ffmpeg runs in a worker thread entirely in memory.
          if (visionProviders().length > 0 && wasmFfmpegAvailable()) {
            const s = await sampleFramesWithWasm(input.data, input.name ?? "in.mp4", { everySeconds: 5, maxFrames: 6, width: 768 });
            if (s.ok && s.frames.length) {
              const frames = s.frames.map((b) => `data:image/jpeg;base64,${b.toString("base64")}`);
              const r = await route({ preferred: input.preferred, temperature: 0.1, maxTokens: 1000, messages: [{ role: "system", content: "You see frames sampled every 5 seconds from a video (in order). Describe what happens over time; answer the question if given. If the frames are uninformative, say so rather than inventing detail." }, { role: "user", content: `${input.question ?? "What happens in this video?"}`, images: frames }] });
              noteVideoPath("ffmpeg-wasm", `frames=${frames.length} version=${s.version ?? "?"}`);
              return done({ ok: true, text: r.content, structured: { frames: frames.length, via: "ffmpeg-wasm", ffmpegVersion: s.version, atSeconds: s.atSeconds, container: container.ok ? container : undefined, why: "no ffmpeg binary on this host — frames were sampled by the in-process WASM build instead" }, provider: r.provider, model: r.model });
            }
            // Fall through on purpose: a codec the WASM build lacks may still be handled inline.
          }

          // Path 3: neither. The container still yields real facts — return them, and say plainly
          // that no frames were looked at. Cover art, when present, is a real image we can describe.
          if (container.coverArt && visionProviders().length > 0) {
            const covr = coverArtOf(input.data);
            if (covr) {
              const r = await route({ preferred: input.preferred, temperature: 0.1, maxTokens: 700, messages: [{ role: "system", content: "This is the poster image embedded in a video file. Describe it and read any text verbatim. It is not a frame from the video; do not claim otherwise." }, { role: "user", content: `${input.question ?? "Describe this video's poster image."}\n\nContainer facts: ${facts}`, images: [`data:${container.coverArt.mime};base64,${covr.toString("base64")}`] }] });
              noteVideoPath("embedded-cover-art", facts.slice(0, 120));
              return done({ ok: true, text: r.content, structured: { frames: 0, via: "embedded-cover-art", container, containerFacts: facts, why: "no ffmpeg on this host and no video-native model configured — the embedded poster was analysed instead of the footage" }, provider: r.provider, model: r.model });
            }
          }
          if (!container.ok) { noteVideoPath("none", container.reason ?? "unreadable container", false); return done({ ok: false, text: "", reason: container.reason }); }
          noteVideoPath("container-metadata", facts.slice(0, 120));
          return done({ ok: true, text: facts, structured: { frames: 0, via: "container-metadata", container, containerFacts: facts, why: "no ffmpeg on this host and no video-native model configured — container metadata only, no frames were analysed" } });
        }
        case "sensor": {
          if (!input.series?.length) return done({ ok: false, text: "", reason: "series [{t,v}] required" });
          const a = analyzeSeries(input.series);
          if (!input.question) return done({ ok: true, text: `${a.n} samples · mean ${a.mean?.toFixed(3)} · sd ${a.sd?.toFixed(3)} · ${a.trend} · ${a.anomalies?.length ?? 0} anomalies`, structured: a });
          const r = await route({ preferred: input.preferred, temperature: 0.1, maxTokens: 600, messages: [{ role: "system", content: "You interpret sensor statistics for an engineer. Be quantitative and cautious; never invent causes without saying they are hypotheses." }, { role: "user", content: `Question: ${input.question}\nStats: ${JSON.stringify(a)}` }] });
          return done({ ok: true, text: r.content, structured: a, provider: r.provider, model: r.model });
        }
      }
    } catch (e) { return done({ ok: false, text: "", reason: (e as Error).message }); }
  });
}

/** Pull the embedded cover image out of an ISO media file (`moov/udta/meta/ilst/covr/data`). */
export function coverArtOf(data: Buffer): Buffer | null {
  const idx = data.indexOf("covr");
  if (idx < 0) return null;
  const d = data.indexOf("data", idx + 4);
  if (d < 0 || d + 12 > data.length) return null;
  const size = data.readUInt32BE(d - 4);
  const end = d - 4 + size;
  // box = size(4) + "data"(4) + version/flags(4) + locale(4) + payload
  if (size < 20 || end > data.length) return null;
  return data.subarray(d + 12, end);
}

/** OpenAI-compatible speech-to-text. Groq's free tier hosts whisper-large-v3. */
export async function transcribe(data: Buffer, name: string, mime?: string): Promise<{ ok: true; text: string; language?: string; provider: string; model: string } | { ok: false; reason: string }> {
  await hydrateRouterStores(); // hosted: refresh runtime keys (TTL-gated; no-op on files)
  const sttKey = resolvedEnv("STT_KEY"); const groq = resolvedEnv("GROQ_API_KEY");
  const custom = process.env.STT_URL && sttKey;
  if (!custom && !groq) return { ok: false, reason: "no speech-to-text provider configured (set GROQ_API_KEY — free — or STT_URL/STT_KEY)" };
  const url = custom ? `${process.env.STT_URL!.replace(/\/$/, "")}/audio/transcriptions` : "https://api.groq.com/openai/v1/audio/transcriptions";
  const model = process.env.STT_MODEL ?? (custom ? "whisper-1" : "whisper-large-v3");
  const fd = new FormData(); fd.append("file", new Blob([new Uint8Array(data)], { type: mime ?? "application/octet-stream" }), name); fd.append("model", model); fd.append("response_format", "verbose_json");
  const r = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${custom ? sttKey : groq}` }, body: fd, signal: AbortSignal.timeout(120_000) });
  if (!r.ok) return { ok: false, reason: `STT ${r.status}: ${(await r.text()).slice(0, 200)}` };
  const j = (await r.json()) as { text: string; language?: string };
  return { ok: true, text: j.text, language: j.language, provider: custom ? "custom" : "groq", model };
}
