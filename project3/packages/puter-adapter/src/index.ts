// Puter.js adapter — optional infrastructure layer.
// https://developer.puter.com
// Local-first: when Puter is not signed in, every operation transparently
// falls back to local storage. Authentication is never forced.

export const PUTER_DOC_URL = 'https://developer.puter.com';
export const PUTER_SCRIPT_URL = 'https://js.puter.com/v2/';

export interface PuterAuth {
  isSignedIn(): boolean;
  signIn(): Promise<unknown>;
  signOut(): void;
  getUser?(): Promise<{ username: string }>;
}

export interface PuterKV {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<unknown>;
  del(key: string): Promise<unknown>;
}

export interface PuterFs {
  read(path: string): Promise<string>;
  write(path: string, data: string): Promise<unknown>;
  mkdir(path: string, opts?: { createMissingParents?: boolean }): Promise<unknown>;
}

export interface PuterApi {
  auth: PuterAuth;
  kv: PuterKV;
  fs: PuterFs;
}

export function puter(): PuterApi | null {
  if (typeof window === 'undefined') return null;
  const p = (window as unknown as { puter?: PuterApi }).puter;
  return p ?? null;
}

export function puterSignedIn(): boolean {
  try {
    return !!puter()?.auth?.isSignedIn();
  } catch {
    return false;
  }
}

export async function puterUser(): Promise<string | null> {
  try {
    const u = await puter()?.auth?.getUser?.();
    return u?.username ?? null;
  } catch {
    return null;
  }
}

export interface PuterConnectError {
  /** Machine-readable reason the connection failed. */
  code: 'script-not-loaded' | 'storage-unavailable' | 'popup-blocked' | 'auth-window-closed' | 'not-available-in-app' | 'sign-in-failed' | 'unknown';
  /** Human-readable detail intended for the UI. */
  message: string;
}

export interface PuterConnectResult {
  ok: boolean;
  user?: string;
  error?: PuterConnectError;
}

export async function connectPuter(): Promise<PuterConnectResult> {
  const p = puter();
  if (!p) {
    return {
      ok: false,
      error: {
        code: 'script-not-loaded',
        message:
          'Puter.js has not loaded. A network filter or content blocker may be blocking js.puter.com — or open the app in a new tab and try again.',
      },
    };
  }

  // Puter keeps its session token in the page's storage. In an embedded view
  // that blocks storage (sandboxed iframe), the popup can succeed but the
  // session can never stick — detect that up front instead of failing silently.
  let storageOk = true;
  try {
    const ls = window.localStorage;
    void ls;
  } catch {
    storageOk = false;
  }
  if (!storageOk) {
    return {
      ok: false,
      error: {
        code: 'storage-unavailable',
        message:
          'This embedded view blocks browser storage, which Puter needs to keep you signed in. Open the app in a new tab and connect there.',
      },
    };
  }

  try {
    // Opens a popup; must be called from a user action. Rejects with an
    // object carrying an `error` code (popup_blocked, auth_window_closed, …).
    await p.auth.signIn();
  } catch (e) {
    const code = (e as { error?: unknown })?.error;
    const msg = (e as { msg?: unknown })?.msg;
    if (code === 'popup_blocked') {
      return {
        ok: false,
        error: {
          code: 'popup-blocked',
          message: 'The sign-in popup was blocked. Allow popups for this site, or open the app in a new tab and connect there.',
        },
      };
    }
    if (code === 'auth_window_closed') {
      return {
        ok: false,
        error: { code: 'auth-window-closed', message: 'The sign-in window was closed before the process finished. Try again.' },
      };
    }
    if (code === 'not_available_in_app') {
      return {
        ok: false,
        error: { code: 'not-available-in-app', message: 'Puter apps are already signed in via the app shell.' },
      };
    }
    return {
      ok: false,
      error: { code: 'unknown', message: typeof msg === 'string' ? msg : String(e).slice(0, 200) },
    };
  }

  if (!puterSignedIn()) {
    return { ok: false, error: { code: 'sign-in-failed', message: 'Sign-in did not complete. Please try again.' } };
  }
  const user = (await puterUser()) ?? undefined;
  return { ok: true, user };
}

export async function disconnectPuter(): Promise<void> {
  try {
    puter()?.auth?.signOut();
  } catch {
    /* noop */
  }
}

export interface KVStore {
  /** 'puter' when signed in, otherwise 'local'. */
  mode: 'puter' | 'local';
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  del(key: string): Promise<void>;
}

const LS_PREFIX = 'sutra:kv:';

/**
 * KV store with the same interface on both backends.
 * Puter KV when the user is signed in; localStorage otherwise.
 */
export function createKVStore(): KVStore {
  const p = puter();
  if (p && p.auth.isSignedIn()) {
    return {
      mode: 'puter',
      async get(key) {
        try {
          const v = await p.kv.get(key);
          return v == null ? null : String(v);
        } catch {
          return null;
        }
      },
      async set(key, value) {
        await p.kv.put(key, value);
      },
      async del(key) {
        try {
          await p.kv.del(key);
        } catch {
          /* noop */
        }
      },
    };
  }
  return {
    mode: 'local',
    async get(key) {
      try {
        return localStorage.getItem(LS_PREFIX + key);
      } catch {
        return null;
      }
    },
    async set(key, value) {
      try {
        localStorage.setItem(LS_PREFIX + key, value);
      } catch {
        /* storage full or unavailable */
      }
    },
    async del(key) {
      try {
        localStorage.removeItem(LS_PREFIX + key);
      } catch {
        /* noop */
      }
    },
  };
}

/** Writes a file into the Puter cloud filesystem. Requires sign-in. */
export async function puterFsWrite(root: string, name: string, content: string): Promise<void> {
  const p = puter();
  if (!p || !p.auth.isSignedIn()) throw new Error('Puter is not signed in (local mode)');
  const dir = `/aetherion/${root}`;
  await p.fs.mkdir(dir, { createMissingParents: true });
  await p.fs.write(`${dir}/${name}`, content);
}

/* ─────────────────────────── Puter AI gateway ───────────────────────────
 * Puter.js v2 exposes an AI gateway: 500+ models across OpenAI, Anthropic,
 * Google and more, plus image generation — no API keys, all usage billed to
 * the signed-in user's own Puter account. Every call is optional: local mode
 * (not signed in) simply returns null and the workspace keeps working.
 */

export interface PuterAiModel {
  id: string;
  name: string;
  provider: string;
  /** Some list responses include context/limits; keep them when present. */
  contextWindow?: number;
  costPerMInput?: number;
  costPerMOutput?: number;
}

interface PuterAiApi {
  listModels?: () => Promise<unknown>;
  listModelProviders?: () => Promise<unknown>;
  chat?: (messages: unknown, options?: Record<string, unknown>) => Promise<unknown>;
  txt2img?: (prompt: string, options?: Record<string, unknown>) => Promise<unknown>;
}

/** Puter.ai is available only when Puter.js loaded AND the user is signed in. */
export function puterAiAvailable(): boolean {
  const p = puter();
  return !!(p && p.auth?.isSignedIn() && (p as unknown as { ai?: PuterAiApi }).ai);
}

function puterAi(): PuterAiApi | null {
  const p = puter();
  if (!p || !p.auth?.isSignedIn()) return null;
  const ai = (p as unknown as { ai?: PuterAiApi }).ai;
  return ai ?? null;
}

/** Lists every model reachable through the Puter AI gateway. */
export async function listPuterModels(): Promise<PuterAiModel[]> {
  try {
    const ai = puterAi();
    if (!ai?.listModels) return [];
    const raw = (await ai.listModels()) as
      | PuterAiModel[]
      | { models?: unknown[]; providers?: unknown[] }
      | Record<string, unknown>;
    const items: unknown[] = Array.isArray(raw) ? raw : Array.isArray((raw as { models?: unknown[] }).models) ? (raw as { models?: unknown[] }).models! : [];
    const out: PuterAiModel[] = [];
    for (const it of items) {
      const o = it as Record<string, unknown>;
      const id = String(o.id ?? o.model ?? o.name ?? '').trim();
      if (!id) continue;
      const cost = o.cost as { in?: number; out?: number } | undefined;
      out.push({
        id,
        name: String(o.name ?? o.id ?? id),
        provider: String(o.provider ?? o.organization ?? 'puter-gateway'),
        contextWindow: typeof o.context_window === 'number' ? o.context_window : typeof o.context === 'number' ? o.context : undefined,
        costPerMInput: typeof cost?.in === 'number' ? cost.in : undefined,
        costPerMOutput: typeof cost?.out === 'number' ? cost.out : undefined,
      });
    }
    return out;
  } catch {
    return [];
  }
}

export interface PuterAiChatResult {
  content: string;
  model: string;
  provider: string;
}

function normalizeAiText(res: unknown): string {
  if (typeof res === 'string') return res;
  if (res && typeof res === 'object') {
    const o = res as Record<string, unknown>;
    // Chat models return a Message: { content: [...] } or { text }
    const c = o.content ?? o.text ?? o.message;
    if (typeof c === 'string') return c;
    if (Array.isArray(c)) {
      return c
        .map((part) => {
          const p = part as Record<string, unknown>;
          if (typeof p === 'string') return p;
          return String(p?.text ?? p?.content ?? '');
        })
        .join('');
    }
    if (c && typeof c === 'object') return normalizeAiText(c);
    // Completion-style responses carry a single text field.
    const t = o.text ?? o.response ?? o.output;
    if (typeof t === 'string') return t;
  }
  return '';
}

/** One chat turn through the Puter AI gateway. Returns null when unavailable. */
export async function puterAiChat(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  options?: { model?: string; temperature?: number; maxTokens?: number },
): Promise<PuterAiChatResult | null> {
  try {
    const ai = puterAi();
    if (!ai?.chat) return null;
    const opts: Record<string, unknown> = {};
    if (options?.model) opts.model = options.model;
    if (typeof options?.temperature === 'number') opts.temperature = options.temperature;
    if (typeof options?.maxTokens === 'number') opts.max_tokens = options.maxTokens;
    const res = await ai.chat(messages, opts);
    const content = normalizeAiText(res);
    if (!content) return null;
    return {
      content,
      model: String((options?.model ?? (res as { model?: string })?.model) || 'puter-gateway'),
      provider: 'puter',
    };
  } catch {
    return null;
  }
}

export interface PuterImageResult {
  /** URL or data-URL of the generated image. */
  src: string;
  prompt: string;
}

function normalizeImageSrc(res: unknown): string | null {
  if (!res) return null;
  if (typeof res === 'string') return res;
  if (typeof res === 'object') {
    const o = res as Record<string, unknown>;
    const cand = o.url ?? o.src ?? o.image ?? o.href;
    if (typeof cand === 'string') return cand;
  }
  return null;
}

/** Text → image through Puter. Returns null when unavailable or on failure. */
export async function puterTxt2Img(prompt: string, options?: { width?: number; height?: number }): Promise<PuterImageResult | null> {
  try {
    const ai = puterAi();
    if (!ai?.txt2img) return null;
    const opts: Record<string, unknown> = {};
    if (options?.width) opts.width = options.width;
    if (options?.height) opts.height = options.height;
    const res = await ai.txt2img(prompt, opts);
    const src = normalizeImageSrc(res);
    if (!src) return null;
    return { src, prompt };
  } catch {
    return null;
  }
}
