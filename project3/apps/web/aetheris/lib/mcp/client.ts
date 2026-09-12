/**
 * Minimal Model Context Protocol client over Streamable HTTP (spec 2025-03-26).
 * Handles initialize → tools/list → tools/call, JSON or SSE responses, session ids.
 */

export interface McpTool {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

export interface McpServerConn {
  url: string;
  headers?: Record<string, string>;
}

interface RpcResponse { id?: number; result?: unknown; error?: { code: number; message: string } }

export class McpError extends Error {
  constructor(message: string, public readonly status?: number) { super(message); this.name = "McpError"; }
}

export class McpClient {
  private sessionId?: string;
  private nextId = 1;
  private initialized = false;

  constructor(private conn: McpServerConn, private timeoutMs = 30_000) {}

  private async rpc<T>(method: string, params?: unknown, notify = false): Promise<T> {
    const id = notify ? undefined : this.nextId++;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), this.timeoutMs);
    let res: Response;
    try {
      res = await fetch(this.conn.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          ...(this.sessionId ? { "Mcp-Session-Id": this.sessionId } : {}),
          ...(this.conn.headers ?? {}),
        },
        body: JSON.stringify({ jsonrpc: "2.0", ...(id !== undefined ? { id } : {}), method, ...(params !== undefined ? { params } : {}) }),
        signal: ctrl.signal,
        cache: "no-store",
      });
    } catch (e) {
      throw new McpError(`MCP ${method}: ${(e as Error).message}`);
    } finally {
      clearTimeout(t);
    }
    const sid = res.headers.get("mcp-session-id");
    if (sid) this.sessionId = sid;
    if (!res.ok) throw new McpError(`MCP ${method} → HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`, res.status);
    if (notify || res.status === 202) return undefined as T;

    const ct = res.headers.get("content-type") ?? "";
    let msg: RpcResponse | undefined;
    if (ct.includes("text/event-stream")) {
      const text = await res.text();
      for (const line of text.split("\n")) {
        if (!line.startsWith("data:")) continue;
        try {
          const m = JSON.parse(line.slice(5).trim()) as RpcResponse;
          if (m.id === id) { msg = m; break; }
        } catch { /* skip */ }
      }
    } else {
      msg = (await res.json()) as RpcResponse;
    }
    if (!msg) throw new McpError(`MCP ${method}: no response for id ${id}`);
    if (msg.error) throw new McpError(`MCP ${method}: ${msg.error.message} (${msg.error.code})`);
    return msg.result as T;
  }

  async initialize(): Promise<{ name?: string; version?: string }> {
    if (this.initialized) return {};
    const r = await this.rpc<{ serverInfo?: { name?: string; version?: string } }>("initialize", {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "aetheris-one", version: "0.1.0" },
    });
    await this.rpc("notifications/initialized", undefined, true).catch(() => undefined);
    this.initialized = true;
    return r.serverInfo ?? {};
  }

  async listTools(): Promise<McpTool[]> {
    await this.initialize();
    const r = await this.rpc<{ tools: McpTool[] }>("tools/list", {});
    return r.tools ?? [];
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    await this.initialize();
    const r = await this.rpc<{ content?: { type: string; text?: string; data?: string; mimeType?: string }[]; isError?: boolean }>(
      "tools/call", { name, arguments: args },
    );
    const text = (r.content ?? [])
      .map((c) => (c.type === "text" ? c.text ?? "" : `[${c.type}${c.mimeType ? ` ${c.mimeType}` : ""}]`))
      .join("\n");
    if (r.isError) throw new McpError(text || "tool returned an error");
    return text;
  }
}
