// OpenAI-compatible adapter — works with vLLM, LM Studio, SGLang,
// llama.cpp server, Together, Groq, any /chat/completions endpoint (SSE).
import type { ModelInfo } from '@sutra/shared';
import type { ChatProvider, ChatRequest, PingResult, StreamChunk } from './types';

const base = (u: string) => u.replace(/\/+$/, '');

export class OpenAICompatProvider implements ChatProvider {
  readonly id = 'openai-compat';
  readonly modelId: string;
  readonly name: string;
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly info: ModelInfo;

  constructor(baseUrl: string, apiKey: string, modelId: string, info: ModelInfo) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
    this.modelId = modelId;
    this.info = info;
    this.name = `API · ${modelId}`;
  }

  get modelInfo(): ModelInfo {
    return this.info;
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { 'content-type': 'application/json' };
    if (this.apiKey) h.authorization = `Bearer ${this.apiKey}`;
    return h;
  }

  async chat(req: ChatRequest, onChunk: (c: StreamChunk) => void): Promise<void> {
    const res = await fetch(`${base(this.baseUrl)}/chat/completions`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        model: this.modelId,
        messages: req.messages,
        stream: true,
        temperature: req.temperature ?? 0.7,
        max_tokens: req.maxTokens ?? 1024,
      }),
    });
    if (!res.ok || !res.body) {
      const body = await res.text().catch(() => '');
      throw new Error(`API ${res.status}: ${body.slice(0, 160)}`);
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let idx: number;
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (payload === '[DONE]') {
          onChunk({ text: '', done: true });
          return;
        }
        try {
          const j = JSON.parse(payload);
          const delta = j.choices?.[0]?.delta?.content;
          if (delta) onChunk({ text: delta, done: false });
        } catch {
          /* partial SSE frame */
        }
      }
    }
    onChunk({ text: '', done: true });
  }

  async ping(): Promise<PingResult> {
    const t0 = performance.now();
    try {
      const res = await fetch(`${base(this.baseUrl)}/models`, { headers: this.headers() });
      return { ok: res.ok, latencyMs: Math.round(performance.now() - t0), detail: res.ok ? 'endpoint reachable' : `HTTP ${res.status}` };
    } catch (e) {
      return { ok: false, latencyMs: Math.round(performance.now() - t0), detail: String((e as Error)?.message ?? e) };
    }
  }
}
