import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { getUserId, uidCookie } from "@/aetheris/lib/user";
import { getSessionAccount } from "@/aetheris/lib/auth/accounts";
import { appendMessage, colorFor, emitDelta, getRoom, nameFor, touchPresence } from "@/aetheris/lib/rooms/rooms";
import { route } from "@/aetheris/lib/router/router";
import { consumeChat, planFor } from "@/aetheris/lib/billing/entitlements";
import { resolveTier } from "@/aetheris/lib/models/tiers";
import type { ChatMessage } from "@/aetheris/lib/router/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SYSTEM = "You are Aetheris One inside a shared room with several people. Messages are prefixed with the speaker's name. Answer the latest message, address people by name when useful, and be concise. Markdown is fine.";

/** POST { content, name?, ai? } — post a human message; if ai !== false the assistant replies in the room (streamed to everyone). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { uid, isNew } = await getUserId();
  const body = (await req.json().catch(() => ({}))) as { content?: string; name?: string; ai?: boolean; preferred?: string; model?: string };
  const content = (body.content ?? "").trim().slice(0, 20_000);
  if (!content) return NextResponse.json({ error: "content required" }, { status: 400 });
  if (!(await getRoom(id))) return NextResponse.json({ error: "room not found" }, { status: 404 });
  const acc = await getSessionAccount();
  const name = nameFor(uid, body.name ?? acc?.name ?? acc?.email?.split("@")[0]);
  await touchPresence(id, uid, name);
  const human = await appendMessage(id, { role: "user", content, author: { uid, name, color: colorFor(uid) } });
  const res = NextResponse.json({ ok: true, id: human.id });
  if (isNew) res.cookies.set(uidCookie(uid));

  const wantsAi = body.ai !== false && !content.startsWith("//"); // "// aside" messages don't trigger the AI
  if (wantsAi) {
    // fire-and-forget: reply streams to all participants over the event bus
    (async () => {
      const room = (await getRoom(id))!;
      const quota = await consumeChat(uid, 1, "chat");
      const aid = randomBytes(6).toString("hex");
      if (!quota.allowed) { await appendMessage(id, { id: aid, role: "system", content: "Daily limit reached for the person who asked." }); return; }
      const plan = await planFor(uid);
      const { tier } = resolveTier(body.model, plan.id);
      const history: ChatMessage[] = [{ role: "system", content: SYSTEM }, ...room.messages.slice(-30).filter((m) => m.role !== "system").map((m) => ({ role: m.role as "user" | "assistant", content: m.role === "user" ? `${m.author?.name ?? "Someone"}: ${m.content}` : m.content }))];
      let acc = "";
      try {
        const r = await route({ messages: history, preferred: body.preferred, allow: tier.providers, allowKeyless: tier.allowKeyless, maxTokens: tier.maxTokens, onDelta: (t) => { acc += t; void emitDelta(id, aid, t); } });
        await appendMessage(id, { id: aid, role: "assistant", content: r.content || acc, provider: r.provider, model: r.model });
      } catch (e) {
        await appendMessage(id, { id: aid, role: acc ? "assistant" : "system", content: acc || `⚠ ${(e as Error).message}` });
      }
    })().catch(() => undefined);
  }
  return res;
}
