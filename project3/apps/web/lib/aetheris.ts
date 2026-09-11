// SUTRA ⇄ Aetheris One bridge.
// Aetheris (github.com/rajaram-2005/Aetheris) is a local Intelligence OS
// exposing a typed HTTP API: /api/health, /api/capabilities, and an SSE
// streaming /api/chat. SUTRA treats it as an optional connected brain —
// every call is best-effort, local mode never requires it.

export interface AetherisHealth {
  ok: boolean;
  service: string;
  version: string;
  uptime_s?: number;
}

export interface AetherisCapability {
  id: string;
  name?: string;
  category?: string;
  description?: string;
  tags?: string[];
  status?: string;
  security?: string;
}

export interface AetherisCapabilities {
  count: number;
  capabilities: AetherisCapability[];
}

export interface AetherisChatResult {
  content: string;
  provider?: string;
  model?: string;
  offline?: boolean;
  /** Set when the core streamed an error event (e.g. providers unreachable). */
  error?: string;
}

const REQUEST_TIMEOUT_MS = 8000;

async function fetchJson<T>(url: string): Promise<T> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), REQUEST_TIMEOUT_MS);
  try {
    // Relative /api/* URLs hit the embedded core in this same app.
    const res = await fetch(url, { signal: ctl.signal, headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

function apiUrl(baseUrl: string, path: string): string {
  const base = aetherisBaseUrl(baseUrl);
  return base ? `${base}${path}` : path;
}

export function aetherisBaseUrl(raw: string | undefined): string {
  const t = (raw ?? '').trim().replace(/\/+$/, '');
  // Empty = the embedded core: Aetheris's API is vendored into this app and
  // served from the same origin under /api/*. A non-empty value targets an
  // external Aetheris One instance instead (advanced).
  return t;
}

export async function aetherisHealth(baseUrl: string): Promise<AetherisHealth | null> {
  try {
    return await fetchJson<AetherisHealth>(apiUrl(baseUrl, '/api/health'));
  } catch {
    return null;
  }
}

export async function aetherisCapabilities(baseUrl: string): Promise<AetherisCapabilities | null> {
  try {
    return await fetchJson<AetherisCapabilities>(apiUrl(baseUrl, '/api/capabilities?limit=80'));
  } catch {
    return null;
  }
}

export interface SseFrame {
  event?: string;
  data: string;
  id?: number;
}

/** Parses an SSE payload (pure + testable). */
export function parseSse(text: string): SseFrame[] {
  const frames: SseFrame[] = [];
  for (const block of text.split(/\r?\n\r?\n/)) {
    if (!block.trim()) continue;
    const frame: SseFrame = { data: '' };
    const dataLines: string[] = [];
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith('event:')) frame.event = line.slice(6).trim();
      else if (line.startsWith('id:')) frame.id = Number(line.slice(3).trim()) || undefined;
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
    }
    frame.data = dataLines.join('\n');
    frames.push(frame);
  }
  return frames;
}

/** Reduces parsed SSE frames into the assistant answer. */
export function reduceSse(frames: SseFrame[]): AetherisChatResult {
  let content = '';
  let provider: string | undefined;
  let model: string | undefined;
  let offline: boolean | undefined;
  let error: string | undefined;
  for (const f of frames) {
    let json: Record<string, unknown> | null = null;
    try {
      json = JSON.parse(f.data) as Record<string, unknown>;
    } catch {
      json = null;
    }
    const type = f.event ?? (json && typeof json.type === 'string' ? (json.type as string) : null);
    if (type === 'delta' && json && typeof json.text === 'string') content += json.text;
    else if (type === 'provider') provider = json ? String(json.provider ?? '') : '';
    else if (type === 'done' && json) {
      provider = String(json.provider ?? provider ?? '');
      model = String(json.model ?? '');
      offline = Boolean(json.offline);
    } else if (type === 'error' && json) {
      error = String(json.error ?? 'Aetheris reported an error');
    }
  }
  if (error) throw new Error(error);
  return { content: content.trim(), provider, model, offline };
}

/** One chat turn against Aetheris /api/chat (SSE streaming). */
export async function aetherisChat(
  baseUrl: string,
  messages: Array<{ role: string; content: string }>,
): Promise<AetherisChatResult | null> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 120000);
  try {
    const res = await fetch(apiUrl(baseUrl, '/api/chat'), {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
      body: JSON.stringify({ messages: messages.filter((m) => m.role !== 'system').slice(-40) }),
      signal: ctl.signal,
    });
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    const frames: SseFrame[] = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      // split on complete events (double newline)
      let idx: number;
      while ((idx = buf.indexOf('\n\n')) >= 0) {
        frames.push(...parseSse(buf.slice(0, idx + 2)));
        buf = buf.slice(idx + 2);
      }
    }
    if (buf.trim()) frames.push(...parseSse(buf));
    try {
      return reduceSse(frames);
    } catch (e) {
      // The core streams an explicit error event when every provider failed
      // (e.g. no outbound internet). Surface it instead of a generic failure.
      return { content: '', error: (e as Error)?.message ?? 'Aetheris reported an error' };
    }
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
