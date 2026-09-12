import { traced } from "@/aetheris/core/observability/events";
import { ADAPTERS, mediaProviders } from "./providers";
import { hydrateRouterStores } from "@/aetheris/lib/router/hydrate";
import { runtimeKeyFor } from "@/aetheris/lib/router/runtimeKeys";
import { MediaError, type MediaKind, type MediaResult } from "./types";

const cooldown = new Map<string, number>();

/**
 * Resolve the key for a provider: user-supplied BYOK key first, then the app's runtime key
 * store (Settings → API keys), then server env. BYOK keys travel only in the request and are
 * never persisted.
 */
function keyFor(id: string, envKey: string, byok: boolean | undefined, userKeys: Record<string, string>) {
  const u = userKeys[id]?.trim();
  if (byok && u) return u;
  return runtimeKeyFor(envKey) || process.env[envKey]?.trim() || u || undefined;
}

export function mediaMeshStatus(userKeys: Record<string, string> = {}) {
  const now = Date.now();
  return mediaProviders("image").concat(mediaProviders("audio"), mediaProviders("video")).map((p) => ({
    id: p.id, name: p.name, kind: p.kind, byok: !!p.byok, notes: p.notes, envKey: p.envKey,
    configured: Boolean(keyFor(p.id, p.envKey, p.byok, userKeys)),
    cooldown: (cooldown.get(p.id) ?? 0) > now,
  }));
}

export async function generateMedia(opts: {
  kind: MediaKind;
  prompt: string;
  userKeys?: Record<string, string>;
  preferred?: string;
  voice?: string;
  signal?: AbortSignal;
}): Promise<MediaResult> {
  await hydrateRouterStores(); // hosted: refresh runtime keys (TTL-gated; no-op on files)
  return traced({ type: "tool", uid: undefined, capability: "media:studio" }, () => generateMediaInner(opts));
}
async function generateMediaInner(opts: {
  kind: MediaKind;
  prompt: string;
  userKeys?: Record<string, string>;
  preferred?: string;
  voice?: string;
  signal?: AbortSignal;
}): Promise<MediaResult> {
  const userKeys = opts.userKeys ?? {};
  const now = Date.now();
  let candidates = mediaProviders(opts.kind)
    .map((p) => ({ p, key: keyFor(p.id, p.envKey, p.byok, userKeys) }))
    .filter((c): c is { p: typeof c.p; key: string } => Boolean(c.key));
  if (opts.preferred) candidates = [...candidates.filter((c) => c.p.id === opts.preferred), ...candidates.filter((c) => c.p.id !== opts.preferred)];
  candidates = [...candidates.filter((c) => (cooldown.get(c.p.id) ?? 0) <= now), ...candidates.filter((c) => (cooldown.get(c.p.id) ?? 0) > now)];

  if (candidates.length === 0) {
    const names = mediaProviders(opts.kind).map((p) => `${p.name} (${p.envKey})`).join(", ");
    throw new MediaError(`No ${opts.kind} provider configured. Add a key for one of: ${names}`, 503);
  }

  const attempts: MediaResult["attempts"] = [];
  for (const { p, key } of candidates) {
    const started = Date.now();
    try {
      const { url, mime } = await ADAPTERS[p.id]({ prompt: opts.prompt, apiKey: key, voice: opts.voice, signal: opts.signal });
      cooldown.delete(p.id);
      attempts.push({ provider: p.id, ok: true });
      return { provider: p.id, kind: opts.kind, url, mime, latencyMs: Date.now() - started, attempts };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      attempts.push({ provider: p.id, ok: false, error: msg });
      if (msg === "aborted") throw e;
      cooldown.set(p.id, Date.now() + 60_000);
    }
  }
  const err = new MediaError(`All ${opts.kind} providers failed: ` + attempts.map((a) => `${a.provider}: ${a.error}`).join(" | "), 502);
  (err as MediaError & { attempts?: unknown }).attempts = attempts;
  throw err;
}
