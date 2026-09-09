import type { ModelInfo } from '@sutra/shared';

export type { ModelInfo };

export interface RouteAnalysis {
  intents: Array<'code' | 'math' | 'long-context' | 'creative' | 'structured' | 'general'>;
  needsLocal: boolean;
  charCount: number;
  label: string;
}

export interface RankEntry {
  modelId: string;
  score: number;
  reasons: string[];
}

export interface RouteDecision {
  analysis: RouteAnalysis;
  ranking: RankEntry[];
  chosen: ModelInfo | null;
}

export interface ChatRequest {
  model?: string;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  temperature?: number;
  maxTokens?: number;
}

export interface StreamChunk {
  text: string;
  done: boolean;
}

export interface PingResult {
  ok: boolean;
  latencyMs: number;
  detail?: string;
}

/** A provider-agnostic chat adapter. */
export interface ChatProvider {
  id: string;
  name: string;
  modelId: string;
  modelInfo: ModelInfo;
  chat(req: ChatRequest, onChunk: (c: StreamChunk) => void): Promise<void>;
  ping(): Promise<PingResult>;
}
