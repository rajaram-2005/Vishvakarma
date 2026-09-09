// Ollama adapter — talks to a local Ollama runtime over HTTP (NDJSON stream).
import type { ModelInfo } from '@sutra/shared';
import type { ChatProvider, ChatRequest, PingResult, StreamChunk } from './types';

const base = (u: string) => u.replace(/\/+$/, '');

export class OllamaProvider implements ChatProvider {
  readonly id = 'ollama';
  readonly modelId: string;
  readonly name: string;
  private readonly baseUrl: string;
  private readonly info: ModelInfo;

  constructor(baseUrl: string, modelId: string, info: ModelInfo) {
    this.baseUrl = baseUrl;
    this.modelId = modelId;
    this.info = info;
    this.name = `Ollama · ${modelId}`;
  }

  get modelInfo(): ModelInfo {
    return this.info;
  }

  async chat(req: ChatRequest, onChunk: (c: StreamChunk) => void): Promise<void> {
    const res = await fetch(`${base(this.baseUrl)}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: this.modelId,
        messages: req.messages,
        stream: true,
        options: { temperature: req.temperature ?? 0.7 },
      }),
    });
    if (!res.ok || !res.body) throw new Error(`Ollama responded ${res.status}`);
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
        if (!line) continue;
        try {
          const j = JSON.parse(line);
          if (j.message?.content) onChunk({ text: j.message.content, done: false });
          if (j.done) onChunk({ text: '', done: true });
        } catch {
          /* partial line — keep buffering */
        }
      }
    }
    onChunk({ text: '', done: true });
  }

  async ping(): Promise<PingResult> {
    const t0 = performance.now();
    try {
      const res = await fetch(`${base(this.baseUrl)}/api/tags`);
      const j = (await res.json().catch(() => null)) as { models?: Array<{ name: string }> } | null;
      return {
        ok: res.ok,
        latencyMs: Math.round(performance.now() - t0),
        detail: j?.models?.length ? `${j.models.length} model(s) installed` : 'no models installed',
      };
    } catch (e) {
      return { ok: false, latencyMs: Math.round(performance.now() - t0), detail: String((e as Error)?.message ?? e) };
    }
  }
}
