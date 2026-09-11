import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { getUserId } from "@/aetheris/lib/user";
import { store } from "@/aetheris/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface SharedChat { id: string; uid: string; title: string; messages: { role: "user" | "assistant"; content: string; provider?: string; model?: string }[]; createdAt: number; views: number }
const COL = "shares";

/** POST { title, messages } → { id, url } — public read-only snapshot of a chat. */
export async function POST(req: Request) {
  const { uid } = await getUserId();
  const body = await req.json().catch(() => null) as { title?: string; messages?: SharedChat["messages"] } | null;
  if (!body?.messages?.length) return NextResponse.json({ error: "messages required" }, { status: 400 });
  const messages = body.messages.slice(-200).map((m) => ({ role: m.role, content: String(m.content).slice(0, 60_000), provider: m.provider, model: m.model }));
  const id = randomBytes(6).toString("base64url");
  const share: SharedChat = { id, uid, title: (body.title ?? "Shared chat").slice(0, 120), messages, createdAt: Date.now(), views: 0 };
  await store.set(COL, id, share);
  return NextResponse.json({ id, url: `/s/${id}` });
}

/** DELETE ?id= — owner revokes a share. */
export async function DELETE(req: Request) {
  const { uid } = await getUserId();
  const id = new URL(req.url).searchParams.get("id") ?? "";
  const s = await store.get<SharedChat>(COL, id);
  if (!s) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (s.uid !== uid) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  await store.remove(COL, id);
  return NextResponse.json({ ok: true });
}
