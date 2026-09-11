import { ProviderError, type ChatMessage, type ProviderConfig } from "./types";

const DEFAULT_TIMEOUT_MS = Number(process.env.AETHERIS_PROVIDER_TIMEOUT_MS ?? 45_000);

/** HTTP statuses that mean "try the next provider". */
const RETRYABLE = new Set([408, 409, 425, 429, 500, 502, 503, 504, 529]);

export interface AdapterCall {
  provider: ProviderConfig;
  model: string;
  apiKey: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  /** Called with each text delta as it arrives. When omitted the adapter buffers. */
  onDelta?: (text: string) => void;
}

async function doFetch(url: string, init: RequestInit, signal?: AbortSignal): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new ProviderError(`network error: ${msg}`, undefined, true);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

async function ensureOk(res: Response, providerName: string): Promise<void> {
  if (res.ok) return;
  let detail = "";
  try {
    detail = (await res.text()).slice(0, 300);
  } catch {
    /* ignore */
  }
  // 401/403 (bad key) and 404 (bad model) are not retryable *on this provider*, but the
  // router will still move on to the next one. We flag them so the UI can surface config issues.
  const retryable = RETRYABLE.has(res.status);
  throw new ProviderError(
    `${providerName} responded ${res.status}${detail ? `: ${detail}` : ""}`,
    res.status,
    retryable,
  );
}

/** Iterate `data: {...}` events of an SSE body. */
async function* sseJson(res: Response): AsyncGenerator<unknown> {
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf("\n")) !== -1) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      try { yield JSON.parse(data); } catch { /* partial / keep-alive */ }
    }
  }
}

function hasImages(msgs: ChatMessage[]): boolean {
  return msgs.some((m) => m.images && m.images.length > 0);
}

/** A video passed as an inline data URL in the image slot (the only inline binary slot there is). */
export function hasVideo(msgs: ChatMessage[]): boolean {
  return msgs.some((m) => m.images?.some((u) => /^data:video\//i.test(u) || /\.(mp4|mov|m4v|webm|3gp)(\?|$)/i.test(u)));
}

// ---------------------------------------------------------------------------------------
// OpenAI-compatible (Groq, Cerebras, SambaNova, GitHub Models, OpenRouter, Mistral, Together,
// HF router, NVIDIA, DeepSeek, AI21, Perplexity) — streaming + multimodal content parts
// ---------------------------------------------------------------------------------------
function toOpenAIMessages(msgs: ChatMessage[]) {
  return msgs.map((m) => {
    if (!m.images?.length) return { role: m.role, content: m.content };
    return {
      role: m.role,
      content: [
        ...(m.content ? [{ type: "text", text: m.content }] : []),
        ...m.images.map((url) => ({ type: "image_url", image_url: { url } })),
      ],
    };
  });
}

async function callOpenAI(c: AdapterCall): Promise<string> {
  const stream = !!c.onDelta;
  const res = await doFetch(
    `${c.provider.baseUrl}/chat/completions`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${c.apiKey}`,
        ...(c.provider.headers ?? {}),
      },
      body: JSON.stringify({
        model: c.model,
        messages: toOpenAIMessages(c.messages),
        temperature: c.temperature ?? 0.7,
        ...(c.maxTokens ? { max_tokens: c.maxTokens } : {}),
        stream,
      }),
    },
    c.signal,
  );
  await ensureOk(res, c.provider.name);
  if (!stream || !res.headers.get("content-type")?.includes("text/event-stream")) {
    const json = (await res.json()) as { choices?: { message?: { content?: string | null } }[] };
    const content = json.choices?.[0]?.message?.content;
    if (!content) throw new ProviderError(`${c.provider.name} returned an empty completion`, 200, true);
    c.onDelta?.(content);
    return content;
  }
  let out = "";
  for await (const ev of sseJson(res)) {
    const delta = (ev as { choices?: { delta?: { content?: string } }[] }).choices?.[0]?.delta?.content;
    if (delta) { out += delta; c.onDelta!(delta); }
  }
  if (!out) throw new ProviderError(`${c.provider.name} returned an empty completion`, 200, true);
  return out;
}

// ---------------------------------------------------------------------------------------
// Google Gemini (streamGenerateContent / generateContent) — inline_data for images
// ---------------------------------------------------------------------------------------
function geminiParts(m: ChatMessage) {
  const parts: unknown[] = [];
  if (m.content) parts.push({ text: m.content });
  for (const url of m.images ?? []) {
    const match = /^data:([^;]+);base64,(.+)$/.exec(url);
    if (match) parts.push({ inline_data: { mime_type: match[1], data: match[2] } });
    else parts.push({ file_data: { file_uri: url } });
  }
  return parts;
}

async function callGemini(c: AdapterCall): Promise<string> {
  const system = c.messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const contents = c.messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: geminiParts(m) }));

  const stream = !!c.onDelta;
  const method = stream ? "streamGenerateContent?alt=sse" : "generateContent";
  const url = `${c.provider.baseUrl}/models/${encodeURIComponent(c.model)}:${method}`;
  const res = await doFetch(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": c.apiKey },
      body: JSON.stringify({
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        contents,
        generationConfig: {
          temperature: c.temperature ?? 0.7,
          ...(c.maxTokens ? { maxOutputTokens: c.maxTokens } : {}),
        },
      }),
    },
    c.signal,
  );
  await ensureOk(res, c.provider.name);
  type G = { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const textOf = (j: G) => j.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!stream) {
    const text = textOf((await res.json()) as G);
    if (!text) throw new ProviderError(`${c.provider.name} returned an empty completion`, 200, true);
    return text;
  }
  let out = "";
  for await (const ev of sseJson(res)) {
    const t = textOf(ev as G);
    if (t) { out += t; c.onDelta!(t); }
  }
  if (!out) throw new ProviderError(`${c.provider.name} returned an empty completion`, 200, true);
  return out;
}

// ---------------------------------------------------------------------------------------
// Cohere v2 chat (streaming)
// ---------------------------------------------------------------------------------------
async function callCohere(c: AdapterCall): Promise<string> {
  const stream = !!c.onDelta;
  const res = await doFetch(
    `${c.provider.baseUrl}/chat`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${c.apiKey}` },
      body: JSON.stringify({
        model: c.model,
        messages: c.messages.map(({ role, content }) => ({ role, content })),
        temperature: c.temperature ?? 0.7,
        ...(c.maxTokens ? { max_tokens: c.maxTokens } : {}),
        stream,
      }),
    },
    c.signal,
  );
  await ensureOk(res, c.provider.name);
  if (!stream) {
    const json = (await res.json()) as { message?: { content?: { type: string; text?: string }[] } };
    const text = json.message?.content?.filter((p) => p.type === "text").map((p) => p.text ?? "").join("") ?? "";
    if (!text) throw new ProviderError(`${c.provider.name} returned an empty completion`, 200, true);
    return text;
  }
  let out = "";
  for await (const ev of sseJson(res)) {
    const e = ev as { type?: string; delta?: { message?: { content?: { text?: string } } } };
    const t = e.type === "content-delta" ? e.delta?.message?.content?.text : undefined;
    if (t) { out += t; c.onDelta!(t); }
  }
  if (!out) throw new ProviderError(`${c.provider.name} returned an empty completion`, 200, true);
  return out;
}

// ---------------------------------------------------------------------------------------
// Cloudflare Workers AI (buffered)
// ---------------------------------------------------------------------------------------
async function callCloudflare(c: AdapterCall): Promise<string> {
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!account) throw new ProviderError("CLOUDFLARE_ACCOUNT_ID not set", undefined, false);
  const res = await doFetch(
    `${c.provider.baseUrl}/${account}/ai/run/${c.model}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${c.apiKey}` },
      body: JSON.stringify({
        messages: c.messages.map(({ role, content }) => ({ role, content })),
        temperature: c.temperature ?? 0.7,
        ...(c.maxTokens ? { max_tokens: c.maxTokens } : {}),
      }),
    },
    c.signal,
  );
  await ensureOk(res, c.provider.name);
  const json = (await res.json()) as { result?: { response?: string } };
  const text = json.result?.response ?? "";
  if (!text) throw new ProviderError(`${c.provider.name} returned an empty completion`, 200, true);
  c.onDelta?.(text);
  return text;
}

export function callProvider(c: AdapterCall): Promise<string> {
  if (hasImages(c.messages) && !c.provider.vision) {
    return Promise.reject(new ProviderError(`${c.provider.name} does not accept images`, 415, false));
  }
  switch (c.provider.kind) {
    case "openai":
      return callOpenAI(c);
    case "gemini":
      return callGemini(c);
    case "cohere":
      return callCohere(c);
    case "cloudflare":
      return callCloudflare(c);
  }
}

export { hasImages };
