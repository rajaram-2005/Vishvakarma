import { voicePrompt } from "@/aetheris/lib/voice";
import { getKb, kbGroundingBlock, retrieve } from "@/aetheris/lib/kb";
import { NextResponse } from "next/server";
import { route } from "@/aetheris/lib/router/router";
import { ProviderError, type ChatMessage, type ProviderAttempt } from "@/aetheris/lib/router/types";
import { getUserId, uidCookie } from "@/aetheris/lib/user";
import { consumeChat, hasFeature, planFor } from "@/aetheris/lib/billing/entitlements";
import { resolveTier } from "@/aetheris/lib/models/tiers";
import { runAgent, type EnabledServer } from "@/aetheris/lib/mcp/agent";
import { connectorById } from "@/aetheris/lib/mcp/catalog";
import { getSession } from "@/aetheris/lib/github/auth";
import { readTokens, refreshToken, tokensCookie } from "@/aetheris/lib/mcp/oauth";
import { groundingBlock, looksTimeSensitive, searchKeyFor, searchWeb, type SearchResult } from "@/aetheris/lib/search/tavily";
import { characterSystemPrompt, getCharacter, type CharacterMode } from "@/aetheris/lib/characters";
import { RunMemo, SseChannel, lastEventId, runIdOf, sseFrame, sseHeaders } from "@/aetheris/lib/sse";

export const runtime = "nodejs";
export const maxDuration = 300; // streaming responses need the long ceiling (Pro plan; Hobby clamps to 60s)
export const dynamic = "force-dynamic";

const SYSTEM_PROMPT =
  process.env.AETHERIS_SYSTEM_PROMPT ??
  "You are Aetheris One, a helpful, concise AI assistant. Format answers in Markdown when useful.";

/** Claude-style artifacts: substantial standalone content goes in a fenced block the UI renders in a side panel. */
const ARTIFACT_PROMPT =
  `When you produce substantial standalone content — a complete program or file (>15 lines), an HTML page, an SVG, a React component, a Mermaid diagram, or a long document — wrap it in a fenced code block whose info string includes a title, e.g. \`\`\`html title="Landing page" or \`\`\`tsx title="Counter.tsx" or \`\`\`mermaid title="Flow" or \`\`\`markdown title="Report". ` +
  `Such blocks open in the Artifacts panel where the user can preview, edit and download them. For HTML artifacts include full inline CSS/JS so the page runs standalone. Keep short snippets inline as normal code blocks without a title.`;

const MAX_MESSAGES = 40;
const MAX_CHARS = 48_000;

/** Completed chat runs, per instance: retries with the same X-Run-Id replay instead of regenerating. */
const chatRuns = new RunMemo();

function withUidCookies(res: Response, uid: string, isNew: boolean, extra?: { name: string; value: string; maxAge: number }) {
  if (isNew) { const c = uidCookie(uid); res.headers.append("Set-Cookie", `${c.name}=${c.value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${c.maxAge}`); }
  if (extra) res.headers.append("Set-Cookie", `${extra.name}=${extra.value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${extra.maxAge}`);
  return res;
}
const MAX_IMAGES = 4;
const MAX_IMAGE_CHARS = 6_000_000; // ~4.5 MB of base64
const OFFLINE_PROVIDER = "offline-preview";
const OFFLINE_MODEL = "deterministic-connectivity-response";

type InMsg = { role: string; content: string; images?: unknown };

function isMessage(m: unknown): m is InMsg {
  if (!m || typeof m !== "object") return false;
  const r = (m as InMsg).role;
  return (r === "user" || r === "assistant" || r === "system") && typeof (m as InMsg).content === "string";
}

function cleanImages(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v.filter((x): x is string => typeof x === "string" && (x.startsWith("data:image/") || x.startsWith("https://")) && x.length <= MAX_IMAGE_CHARS).slice(0, MAX_IMAGES);
  return out.length ? out : undefined;
}

interface Body {
  messages?: unknown;
  preferred?: unknown;
  temperature?: unknown;
  servers?: unknown;
  stream?: unknown;
  /** Web grounding: "auto" (default), "on", "off" */
  web?: unknown;
  searchKey?: unknown;
  /** Project custom instructions + attached file text */
  project?: { instructions?: unknown; files?: { name?: unknown; text?: unknown }[] } | null;
  /** Long-term memory facts (client-stored) */
  memory?: unknown;
  /** Aetheris model tier id (aetheris-free … aetheris-god). Capped by plan. */
  model?: unknown;
  /** BCP-47 tag when the message came from voice mode: reply is read aloud. */
  voice?: unknown;
  /** Knowledge base id → retrieve passages for the last user message and cite them. */
  kb?: unknown;
  fabric?: unknown;
  workspace?: unknown;
  /** Server-resolved database character. Client sends only an accessible id and interaction mode. */
  character?: { id?: unknown; mode?: unknown } | null;
}

export async function POST(req: Request) {
  const rid = runIdOf(req);
  if (rid) {
    // Retry of a finished run: replay exactly the missed events — no regeneration, no extra quota.
    const memo = chatRuns.get(rid);
    if (memo) {
      const { uid, isNew } = await getUserId();
      const from = lastEventId(req);
      const enc = new TextEncoder();
      const stream = new ReadableStream({
        start(c) { for (const e of memo.events) if (e.id > from) c.enqueue(enc.encode(sseFrame(e.id, e.json))); c.close(); },
      });
      return withUidCookies(new Response(stream, { headers: sseHeaders({ "X-Run-Replay": "1" }) }), uid, isNew);
    }
    if (!chatRuns.claim(rid)) {
      return NextResponse.json(
        { error: "run in progress", detail: "the same run is already generating; retry shortly with the same X-Run-Id and Last-Event-ID" },
        { status: 409, headers: { "Retry-After": "2" } },
      );
    }
  }
  const claim = rid ? { rid, streamed: false } : undefined;
  try {
    return await postInner(req, claim);
  } finally {
    // Non-stream responses never reach a stream finally, so release their claim here. Streaming
    // responses set claim.streamed before returning and release when the stream closes.
    if (claim && !claim.streamed) chatRuns.release(claim.rid);
  }
}
async function postInner(req: Request, claim?: { rid: string; streamed: boolean }) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0 || !body.messages.every(isMessage)) {
    return NextResponse.json({ error: "`messages` must be a non-empty array of {role, content}" }, { status: 400 });
  }

  // Trim history: keep the most recent messages within budget. Client-supplied system
  // messages are dropped; the server owns the system prompt. Images are kept only on the
  // last user message (older ones are described as "[image]" to save tokens/quota).
  const raw = (body.messages as InMsg[]).filter((m) => m.role !== "system").slice(-MAX_MESSAGES);
  let total = 0;
  const kept: ChatMessage[] = [];
  for (let i = raw.length - 1; i >= 0; i--) {
    const m = raw[i];
    total += m.content.length;
    if (total > MAX_CHARS) break;
    const imgs = cleanImages(m.images);
    const isLastUser = i === raw.length - 1 && m.role === "user";
    kept.unshift({
      role: m.role as ChatMessage["role"],
      content: imgs && !isLastUser ? `${m.content}\n[${imgs.length} image(s) attached earlier]` : m.content,
      ...(imgs && isLastUser ? { images: imgs } : {}),
    });
  }
  if (kept.length === 0) {
    return NextResponse.json({ error: "Message too long" }, { status: 413 });
  }

  const { uid, isNew } = await getUserId();

  // Character instructions are always loaded by id from trusted server-side storage. The client
  // cannot submit or override a system prompt, and private characters are owner-scoped.
  let characterBlock: string | undefined;
  let characterMode: CharacterMode | undefined;
  if (body.character != null) {
    const id = typeof body.character.id === "string" ? body.character.id : "";
    const mode = body.character.mode === "roleplay" || body.character.mode === "guide" ? body.character.mode : undefined;
    if (!id || !mode) return NextResponse.json({ error: "character requires a valid id and mode" }, { status: 400 });
    const character = await getCharacter(uid, id);
    if (!character) return NextResponse.json({ error: "character not found" }, { status: 404 });
    if (!character.modes.includes(mode)) return NextResponse.json({ error: `${mode} mode is not enabled for this character` }, { status: 400 });
    characterMode = mode;
    characterBlock = characterSystemPrompt(character, mode);
  }

  const plan = await planFor(uid);
  const { tier } = resolveTier(typeof body.model === "string" ? body.model : undefined, plan.id);
  const tierOpts = { allow: tier.providers, allowKeyless: tier.allowKeyless, maxTokens: tier.maxTokens, priority: plan.features.includes("priority_routing") };
  const quota = await consumeChat(uid);
  if (!quota.allowed) {
    const res = NextResponse.json(
      { error: `Free tier limit reached (${quota.limit} messages/day). Upgrade to Aetheris Pro for unlimited chat.`, code: "quota", quota },
      { status: 402 },
    );
    if (isNew) res.cookies.set(uidCookie(uid));
    return res;
  }

  // ---- System prompt assembly: base + artifacts + project + memory + web grounding ----------
  const sysParts: string[] = [SYSTEM_PROMPT, ARTIFACT_PROMPT];
  if (characterBlock) sysParts.push(characterBlock);
  const proj = body.project ?? null;
  if (proj && typeof proj.instructions === "string" && proj.instructions.trim()) {
    sysParts.push(`PROJECT INSTRUCTIONS (from the user, follow them):\n${proj.instructions.trim().slice(0, 6000)}`);
  }
  if (proj && Array.isArray(proj.files)) {
    let budget = 40_000;
    const docs: string[] = [];
    for (const f of proj.files) {
      if (typeof f?.text !== "string" || !f.text.trim()) continue;
      const t = f.text.slice(0, Math.max(0, budget));
      budget -= t.length;
      docs.push(`--- FILE: ${String(f.name ?? "file")} ---\n${t}`);
      if (budget <= 0) break;
    }
    if (docs.length) sysParts.push(`PROJECT KNOWLEDGE (reference these files when relevant):\n${docs.join("\n\n")}`);
  }
  if (Array.isArray(body.memory) && body.memory.length) {
    const mem = (body.memory as unknown[]).filter((x): x is string => typeof x === "string").slice(0, 60);
    if (mem.length) sysParts.push(`MEMORY — things you know about this user from earlier conversations:\n${mem.map((m) => `- ${m}`).join("\n")}\nUse naturally; do not recite unless asked.`);
  }

  if (typeof body.voice === "string" && /^[a-z]{2}(-[A-Za-z]{2})?$/.test(body.voice)) sysParts.push(voicePrompt(body.voice));
  const lastUser = [...kept].reverse().find((m) => m.role === "user");
  // Server-side typed memory + knowledge fabric (Phase 8): hybrid recall, provenance-stamped. Best-effort, never blocks chat.
  if (lastUser && body.fabric !== false) {
    try {
      const [{ recall, memoryBlock }, { queryUnified: queryFacts, knowledgeBlock }] = await Promise.all([import("@/aetheris/core/memory/memory"), import("@/aetheris/core/knowledge/fabric")]);
      const [mem, facts] = await Promise.all([recall(uid, lastUser.content, { k: 6 }), queryFacts(uid, lastUser.content, { k: 5, workspace: typeof body.workspace === "string" ? body.workspace : undefined })]);
      const mb = memoryBlock(mem); if (mb) sysParts.push(mb);
      const kbk = knowledgeBlock(facts.filter((h) => !h.fact.tags.some((t) => t.startsWith("memory:")))); if (kbk) sysParts.push(kbk);
    } catch { /* fabric unavailable on this host — chat continues without it */ }
  }
  let citations: ReturnType<typeof kbGroundingBlock>["cites"] | undefined; let kbName: string | undefined;
  if (typeof body.kb === "string" && lastUser) {
    const kb = await getKb(body.kb);
    if (kb && kb.uid === uid) {
      const hits = retrieve(kb, lastUser.content, 6);
      kbName = kb.name;
      if (hits.length) { const g = kbGroundingBlock(kb.name, hits); sysParts.push(g.block); citations = g.cites; }
      else sysParts.push(`DOCUMENTS — the user's knowledge base "${kb.name}" (${kb.docs.length} documents) was searched but no relevant passage was found for this message. Say so if they ask about it; do not invent citations.`);
    }
  }
  const webMode = body.web === "on" || body.web === "off" ? body.web : "auto";
  const searchKey = searchKeyFor(typeof body.searchKey === "string" ? body.searchKey : undefined);
  let sources: SearchResult[] | undefined;
  let searchQuery: string | undefined;
  if (searchKey && lastUser && webMode !== "off" && (webMode === "on" || looksTimeSensitive(lastUser.content))) {
    try {
      const r = await searchWeb(lastUser.content, searchKey, { maxResults: 6, signal: req.signal });
      if (r.results.length) { sources = r.results; searchQuery = r.query; sysParts.push(groundingBlock(r)); }
    } catch (e) {
      console.warn("[aetheris] web search failed", (e as Error).message);
    }
  }

  const messages: ChatMessage[] = [{ role: "system", content: sysParts.join("\n\n") }, ...kept];
  const preferred = typeof body.preferred === "string" ? body.preferred : undefined;
  const temperature = typeof body.temperature === "number" ? body.temperature : characterMode === "roleplay" ? 0.75 : characterMode === "guide" ? 0.35 : undefined;
  const wantStream = body.stream !== false;

  const servers = (Array.isArray(body.servers) ? body.servers : []) as EnabledServer[];
  if (servers.length > 0 && servers.some((s) => connectorById(s.id)?.premium)) {
    if (!(await hasFeature(uid, "mcp_premium"))) {
      return NextResponse.json({ error: "That connector is a premium MCP. Upgrade to Aetheris Pro to use it.", code: "upgrade", feature: "mcp_premium" }, { status: 402 });
    }
  }

  // ---- Tool-using agent path (MCP servers enabled): buffered, emits progress events ----------
  if (servers.length > 0) {
    try {
      const gh = await getSession();
      const tokenMap = await readTokens();
      let tokensChanged = false;
      const oauthTokens: Record<string, string> = {};
      for (const [id, t] of Object.entries(tokenMap)) {
        let tok = t;
        if (tok.expires_at && tok.expires_at < Date.now() + 30_000) {
          const r = await refreshToken(tok);
          if (r) { tok = r; tokenMap[id] = r; tokensChanged = true; }
        }
        oauthTokens[id] = tok.access_token;
      }
      const ctx = { uid, github: gh ? { token: gh.token, login: gh.login } : undefined, oauthTokens };
      if (!wantStream) {
        const a = await runAgent({ messages, servers, preferred, ctx });
        const res = NextResponse.json({ content: a.content, provider: a.provider, model: a.model, attempts: [], toolEvents: a.toolEvents, mcpFailures: a.failures, quota, sources, searchQuery, citations });
        if (isNew) res.cookies.set(uidCookie(uid));
        if (tokensChanged) res.cookies.set(tokensCookie(tokenMap));
        return res;
      }
      const stream = new ReadableStream({
        async start(controller) {
          const ch = new SseChannel(controller);
          let completed = false;
          const send = (e: unknown) => { ch.send(e); if ((e as { type?: string }).type === "done") completed = true; };
          try {
            if (sources) send({ type: "sources", sources, query: searchQuery });
        if (citations) send({ type: "citations", kb: kbName, citations });
            if (citations) send({ type: "citations", kb: kbName, citations });
            const a = await runAgent({ messages, servers, preferred, ctx, onEvent: (e) => send({ type: "tool", event: e }) });
            send({ type: "delta", text: a.content, provider: a.provider });
            send({ type: "done", provider: a.provider, model: a.model, attempts: [], toolEvents: a.toolEvents, mcpFailures: a.failures, quota });
          } catch (e) {
            send({ type: "error", error: e instanceof Error ? e.message : String(e), attempts: (e as { attempts?: ProviderAttempt[] }).attempts ?? [] });
          } finally { if (claim && completed) chatRuns.set(claim.rid, ch.log); if (claim) chatRuns.release(claim.rid); controller.close(); }
        },
      });
      if (claim) claim.streamed = true;
      return withUidCookies(new Response(stream, { headers: sseHeaders() }), uid, isNew, tokensChanged ? tokensCookie(tokenMap) : undefined);
    } catch (err) {
      return errorResponse(err);
    }
  }

  // ---- Plain chat path ----------------------------------------------------------------------
  if (!wantStream) {
    try {
      const result = await route({ ...tierOpts, messages, preferred, temperature, signal: req.signal });
      const res = NextResponse.json({ ...result, tier: tier.id, quota, sources, searchQuery, citations });
      if (isNew) res.cookies.set(uidCookie(uid));
      return res;
    } catch (err) {
      const attempts = (err as { attempts?: ProviderAttempt[] }).attempts ?? [];
      if (canUseOfflineFallback(err, attempts)) {
        const res = NextResponse.json({
          content: offlineReply(messages, attempts),
          provider: OFFLINE_PROVIDER,
          model: OFFLINE_MODEL,
          latencyMs: 0,
          attempts,
          offline: true,
          tier: tier.id,
          quota,
          sources,
          searchQuery,
          citations,
        });
        if (isNew) res.cookies.set(uidCookie(uid));
        return res;
      }
      return errorResponse(err);
    }
  }

  const started = Date.now();
  const stream = new ReadableStream({
    async start(controller) {
      const ch = new SseChannel(controller);
      let completed = false;
      const send = (e: unknown) => { ch.send(e); if ((e as { type?: string }).type === "done") completed = true; };
      try {
        if (sources) send({ type: "sources", sources, query: searchQuery });
        if (citations) send({ type: "citations", kb: kbName, citations });
        let current = "";
        const result = await route({
          ...tierOpts, messages, preferred, temperature, signal: req.signal,
          onDelta: (text, provider) => {
            if (provider !== current) { current = provider; send({ type: "provider", provider }); }
            send({ type: "delta", text });
          },
        });
        send({ type: "done", provider: result.provider, model: result.model, tier: tier.id, latencyMs: Date.now() - started, attempts: result.attempts, quota });
      } catch (err) {
        const attempts = (err as { attempts?: ProviderAttempt[] }).attempts ?? [];
        if (canUseOfflineFallback(err, attempts)) {
          send({ type: "provider", provider: OFFLINE_PROVIDER, offline: true });
          send({ type: "delta", text: offlineReply(messages, attempts), provider: OFFLINE_PROVIDER, offline: true });
          send({ type: "done", provider: OFFLINE_PROVIDER, model: OFFLINE_MODEL, latencyMs: Date.now() - started, attempts, offline: true, quota });
        } else {
          send({ type: "error", error: err instanceof Error ? err.message : "Unexpected server error", attempts });
        }
      } finally {
        if (claim && completed) chatRuns.set(claim.rid, ch.log);
        if (claim) chatRuns.release(claim.rid);
        controller.close();
      }
    },
  });
  if (claim) claim.streamed = true;
  return withUidCookies(new Response(stream, { headers: sseHeaders() }), uid, isNew);
}

/**
 * Development previews sometimes have no egress, while a production deployment should fail
 * loudly rather than make an unavailable model look like a working one. The fallback is therefore
 * limited to provider network failures (or no configured providers) and is labelled in both the
 * response metadata and the response text. Set AETHERIS_OFFLINE_FALLBACK=0 to disable it in dev,
 * or =1 to opt into the same honest behaviour in a non-development environment.
 */
function canUseOfflineFallback(err: unknown, attempts: ProviderAttempt[]): boolean {
  const setting = process.env.AETHERIS_OFFLINE_FALLBACK?.trim().toLowerCase();
  const enabled = setting === "1" || setting === "true" || (setting !== "0" && setting !== "false" && process.env.NODE_ENV !== "production");
  if (!enabled || !(err instanceof ProviderError) || err.status === 499) return false;
  if (attempts.length === 0) return err.status === 503;
  return attempts.every((a) => (a.error ?? "").startsWith("network error"));
}

function offlineReply(messages: ChatMessage[], attempts: ProviderAttempt[]): string {
  const prompt = [...messages].reverse().find((m) => m.role === "user")?.content.trim() ?? "";
  const preview = prompt.length > 500 ? `${prompt.slice(0, 500)}…` : prompt;
  const tried = attempts.length ? attempts.map((a) => a.provider).join(", ") : "no configured provider";
  return [
    "### Offline preview",
    "",
    "Aetheris received your message, but no live AI provider was reachable in this development environment.",
    "",
    `**Message received:** ${preview ? `“${preview}”` : "(empty)"}`,
    `**Providers tried:** ${tried}`,
    "",
    "This is a deterministic connectivity response, not an AI-generated answer. Start Ollama, LM Studio, or another OpenAI-compatible local server, or configure a reachable provider API key to get a real model response. Provider failover remains enabled when a provider is reachable.",
  ].join("\n");
}

function errorResponse(err: unknown) {
  if (err instanceof ProviderError) {
    const attempts = (err as ProviderError & { attempts?: ProviderAttempt[] }).attempts ?? [];
    return NextResponse.json({ error: err.message, attempts }, { status: err.status ?? 502 });
  }
  console.error("[aetheris] unexpected error", err);
  return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
}
