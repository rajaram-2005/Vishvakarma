/**
 * Provider-independence contracts. Every major dependency has an interface here so it can be
 * swapped without touching callers. Current bindings are listed next to each interface.
 */
import type { ChatMessage } from "@/aetheris/lib/router/types";

/** Bound: src/lib/router (27 HTTP providers). Local models: implement this and register a ProviderConfig with kind "openai" pointing at localhost (Ollama/LM Studio/vLLM are OpenAI-compatible). */
export interface ModelProvider {
  id: string; name: string; locality: "local" | "remote";
  capabilities: { vision?: boolean; tools?: boolean; maxContext?: number; streaming?: boolean };
  health(): Promise<{ ok: boolean; latencyMs?: number; detail?: string }>;
  complete(req: { messages: ChatMessage[]; temperature?: number; maxTokens?: number; signal?: AbortSignal; onDelta?: (t: string) => void }): Promise<{ content: string; model: string; usage?: { input?: number; output?: number } }>;
}
/** Bound: src/lib/store (JSON files). Postgres/SQLite adapters implement the same 5 calls. */
export interface StorageProvider { get<T>(col: string, id: string): Promise<T | undefined>; all<T>(col: string): Promise<Record<string, T>>; set<T>(col: string, id: string, v: T): Promise<void>; update<T>(col: string, id: string, fn: (cur: T | undefined) => T): Promise<T>; remove(col: string, id: string): Promise<void> }
/** Bound: src/lib/kb (BM25 lexical). A vector adapter adds `embed` and is combined hybrid-style. */
export interface RetrievalProvider { index(docId: string, chunks: { id: string; text: string; meta?: Record<string, unknown> }[]): Promise<void>; search(q: string, k: number, filter?: Record<string, unknown>): Promise<{ id: string; score: number }[]>; remove(docId: string): Promise<void> }
/** Bound: src/lib/search (Tavily). */
export interface SearchProvider { search(q: string, opts?: { maxResults?: number; signal?: AbortSignal }): Promise<{ results: { title: string; url: string; content: string }[] }> }
/** Bound: src/lib/mcp (remote MCP + REST gateway). */
export interface ToolProvider { list(ctx: { uid: string }): Promise<{ name: string; description?: string; inputSchema: Record<string, unknown> }[]>; call(ctx: { uid: string }, name: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<string> }
/** NOT BOUND. Browser automation must expose observable steps and never receive raw credentials. */
export interface BrowserProvider { open(url: string): Promise<{ sessionId: string }>; act(sessionId: string, action: { kind: "click" | "type" | "extract" | "navigate" | "screenshot"; selector?: string; text?: string; url?: string }): Promise<{ ok: boolean; data?: unknown; screenshot?: string }>; close(sessionId: string): Promise<void> }
/** Bound (browser-side only): Pyodide/JS iframe sandbox. Server-side sandbox NOT BOUND. */
export interface ExecutionProvider { run(req: { command: string; cwd?: string; timeoutMs?: number; env?: Record<string, string>; network?: boolean }): Promise<{ exitCode: number; stdout: string; stderr: string; ms: number; fsChanges?: string[] }> }
/** Bound: src/lib/auth (Google/GitHub/email/phone + anonymous device id). */
export interface AuthenticationProvider { currentUser(): Promise<{ uid: string; accountId?: string; admin?: boolean }> }
/** See ../physical/interfaces.ts for DeviceProvider / RobotProvider (NOT BOUND). */
