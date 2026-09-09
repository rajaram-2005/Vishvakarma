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

export async function connectPuter(): Promise<{ ok: boolean; user?: string }> {
  try {
    await puter()?.auth?.signIn();
    return { ok: puterSignedIn(), user: (await puterUser()) ?? undefined };
  } catch {
    return { ok: false };
  }
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
  const dir = `/sutra/${root}`;
  await p.fs.mkdir(dir, { createMissingParents: true });
  await p.fs.write(`${dir}/${name}`, content);
}
