import { route } from "@/aetheris/lib/router/router";
import type { ChatMessage } from "@/aetheris/lib/router/types";
import { McpClient, type McpTool } from "./client";
import { connectorById, type Connector } from "./catalog";
import { apiById } from "@/aetheris/lib/gateway/apis";
import { executeTool, toInputSchema, type ApiDef } from "@/aetheris/lib/gateway/engine";
import type { GH } from "@/aetheris/lib/github/api";

/** A server the user has enabled for this request (credentials come from the browser). */
export interface EnabledServer {
  id: string;                 // catalog id or "custom:<n>"
  url?: string;               // required for custom servers
  credential?: string;        // raw secret; sent only to that server
  headerName?: string;        // custom servers
  headerPrefix?: string;
}

export interface ToolEvent {
  type: "tool_call" | "tool_result" | "tool_error";
  server: string;
  tool: string;
  args?: Record<string, unknown>;
  result?: string;
  error?: string;
}

interface Bound {
  server: string;
  tools: McpTool[];
  call: (tool: string, args: Record<string, unknown>) => Promise<string>;
}

/** Context the agent may need for internal tools. */
export interface AgentContext {
  uid?: string;
  github?: GH;
  /** OAuth tokens obtained via /api/mcp/oauth, keyed by connector id. */
  oauthTokens?: Record<string, string>;
}

function headersFor(s: EnabledServer, c?: Connector): Record<string, string> | undefined {
  const header = c?.auth?.header ?? s.headerName;
  if (!header || !s.credential) return undefined;
  const prefix = c?.auth?.prefix ?? s.headerPrefix ?? "";
  return { [header]: `${prefix}${s.credential}` };
}

export function resolveServer(s: EnabledServer, oauthToken?: string): { url: string; headers?: Record<string, string>; name: string } | null {
  const c = connectorById(s.id);
  if (c?.kind === "gateway") return null;
  const url = c?.url ?? s.url;
  if (!url) return null;
  const headers = oauthToken ? { Authorization: `Bearer ${oauthToken}` } : headersFor(s, c);
  return { url, headers, name: c?.name ?? s.id };
}

async function bindGateway(s: EnabledServer, api: ApiDef, ctx: AgentContext): Promise<Bound> {
  if (api.id === "aetheris-factory") {
    return {
      server: s.id,
      tools: api.tools.map((t) => ({ name: t.name, description: t.description, inputSchema: toInputSchema(t) })),
      call: async (_tool, args) => {
        if (!ctx.github) return "Error: connect GitHub in the Factory tab first.";
        const { runFactory } = await import("@/aetheris/lib/factory/pipeline");
        const lines: string[] = [];
        let verdict = "";
        await runFactory(ctx.github, String(args.task ?? ""), (e) => {
          if (e.type === "step" && e.status !== "start") lines.push(`${e.step}: ${e.status}${e.detail ? ` — ${e.detail}` : ""}`);
          if (e.type === "result") verdict = `CI ${e.conclusion} (${e.ok ? "tests passed" : "tests failed"}). Run: ${e.runUrl}\n\n${e.report}`;
          if (e.type === "error") verdict = `Factory error: ${e.message}`;
        });
        return `${lines.join("\n")}\n\n${verdict}`;
      },
    };
  }
  return {
    server: s.id,
    tools: api.tools.map((t) => ({ name: t.name, description: t.description, inputSchema: toInputSchema(t) })),
    call: (tool, args) => {
      const t = api.tools.find((x) => x.name === tool);
      if (!t) throw new Error(`unknown tool ${tool}`);
      return executeTool(api, t, args, s.credential);
    },
  };
}

/** Connect to each enabled server and list its tools. Failures are reported, not fatal. */
export async function bindServers(servers: EnabledServer[], ctx: AgentContext = {}): Promise<{ bound: Bound[]; failures: { server: string; error: string }[] }> {
  const bound: Bound[] = [];
  const failures: { server: string; error: string }[] = [];
  // When the hub is enabled, other enabled connectors are folded into it (their pasted
  // credentials are used) rather than bound twice.
  const hubOn = servers.some((s) => s.id === "hub");
  const toBind = hubOn ? servers.filter((s) => s.id === "hub") : servers;
  await Promise.all(
    toBind.map(async (s) => {
      // "hub" = every connector behind one server (tools <connector>__<tool> + hub__search_tools).
      if (s.id === "hub") {
        const { listHubTools, callHubTool, getStoredCreds } = await import("./hub");
        const creds = ctx.uid ? await getStoredCreds(ctx.uid) : {};
        for (const o of servers) if (o.id !== "hub" && o.credential) creds[o.id] = o.credential;
        const hctx = { uid: ctx.uid ?? "anon", creds, oauthTokens: ctx.oauthTokens, github: ctx.github };
        const { tools } = await listHubTools(hctx, { eager: false, readyOnly: true });
        return bound.push({ server: "hub", tools: tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })), call: (tool, args) => callHubTool(hctx, tool, args) });
      }
      const c = connectorById(s.id);
      if (c?.kind === "gateway") {
        const api = apiById(s.id);
        if (!api) return failures.push({ server: s.id, error: "gateway definition missing" });
        return bound.push(await bindGateway(s, api, ctx));
      }
      const r = resolveServer(s, ctx.oauthTokens?.[s.id]);
      if (!r) return failures.push({ server: s.id, error: "no URL" });
      const client = new McpClient({ url: r.url, headers: r.headers });
      try {
        const tools = await client.listTools();
        bound.push({ server: s.id, tools, call: (tool, args) => client.callTool(tool, args) });
      } catch (e) {
        failures.push({ server: s.id, error: (e as Error).message });
      }
    }),
  );
  return { bound, failures };
}

// ---- Prompt-protocol tool calling (works with any chat model) ------------------------------

const TOOL_OPEN = "<tool_call>";
const TOOL_CLOSE = "</tool_call>";

function toolPrompt(bound: Bound[]): string {
  const lines = bound.flatMap((b) =>
    b.tools.map((t) => `- ${b.server}.${t.name}: ${t.description ?? ""}\n  input schema: ${JSON.stringify(t.inputSchema)}`),
  );
  return `You can call external tools. Available tools:\n${lines.join("\n")}\n\n` +
    `To call a tool, reply with ONLY:\n${TOOL_OPEN}{"name":"<server>.<tool>","arguments":{...}}${TOOL_CLOSE}\n` +
    `You will receive the result in a message starting with "TOOL RESULT". You may call tools several times. ` +
    `When you have enough information, answer the user normally without any ${TOOL_OPEN} tag. Never invent tool results.`;
}

function parseToolCall(text: string): { name: string; arguments: Record<string, unknown> } | null {
  const i = text.indexOf(TOOL_OPEN);
  if (i === -1) return null;
  const j = text.indexOf(TOOL_CLOSE, i);
  const raw = text.slice(i + TOOL_OPEN.length, j === -1 ? undefined : j).trim();
  try {
    const p = JSON.parse(raw.replace(/^```(?:json)?|```$/g, "").trim());
    if (typeof p.name !== "string") return null;
    return { name: p.name, arguments: p.arguments ?? p.args ?? {} };
  } catch {
    return null;
  }
}

export async function runAgent(opts: {
  messages: ChatMessage[];
  servers: EnabledServer[];
  preferred?: string;
  maxRounds?: number;
  onEvent?: (e: ToolEvent) => void;
  ctx?: AgentContext;
}): Promise<{ content: string; provider: string; model: string; rounds: number; toolEvents: ToolEvent[]; failures: { server: string; error: string }[] }> {
  const { bound, failures } = await bindServers(opts.servers, opts.ctx ?? {});
  const toolEvents: ToolEvent[] = [];
  const emit = (e: ToolEvent) => { toolEvents.push(e); opts.onEvent?.(e); };

  if (bound.length === 0) {
    const r = await route({ messages: opts.messages, preferred: opts.preferred });
    return { content: r.content, provider: r.provider, model: r.model, rounds: 0, toolEvents, failures };
  }

  const sys = opts.messages.find((m) => m.role === "system");
  const rest = opts.messages.filter((m) => m.role !== "system");
  const convo: ChatMessage[] = [
    { role: "system", content: `${sys?.content ?? ""}\n\n${toolPrompt(bound)}` },
    ...rest,
  ];

  const max = opts.maxRounds ?? 6;
  let last = { content: "", provider: "", model: "" };
  for (let round = 0; round <= max; round++) {
    const r = await route({ messages: convo, preferred: opts.preferred, temperature: 0.2 });
    last = r;
    const call = parseToolCall(r.content);
    if (!call || round === max) {
      return { content: r.content.replace(/<tool_call>[\s\S]*$/, "").trim() || r.content, provider: r.provider, model: r.model, rounds: round, toolEvents, failures };
    }
    const dot = call.name.indexOf(".");
    const server = dot === -1 ? bound[0].server : call.name.slice(0, dot);
    const tool = dot === -1 ? call.name : call.name.slice(dot + 1);
    const b = bound.find((x) => x.server === server) ?? bound.find((x) => x.tools.some((t) => t.name === tool));
    emit({ type: "tool_call", server, tool, args: call.arguments });
    convo.push({ role: "assistant", content: r.content });
    if (!b) {
      const error = `unknown tool ${call.name}`;
      emit({ type: "tool_error", server, tool, error });
      convo.push({ role: "user", content: `TOOL RESULT (error): ${error}` });
      continue;
    }
    try {
      const result = await b.call(tool, call.arguments);
      const clipped = result.length > 8000 ? result.slice(0, 8000) + "\n…(truncated)" : result;
      emit({ type: "tool_result", server: b.server, tool, result: clipped });
      convo.push({ role: "user", content: `TOOL RESULT for ${b.server}.${tool}:\n${clipped}` });
    } catch (e) {
      const error = (e as Error).message;
      emit({ type: "tool_error", server: b.server, tool, error });
      convo.push({ role: "user", content: `TOOL RESULT (error) for ${b.server}.${tool}: ${error}` });
    }
  }
  return { content: last.content, provider: last.provider, model: last.model, rounds: max, toolEvents, failures };
}
