import { NextResponse } from "next/server";
import { getUserId, uidCookie } from "@/aetheris/lib/user";
import { createRoom, type RoomMessage } from "@/aetheris/lib/rooms/rooms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST { title?, messages? } → { id, url } — open a collaborative room (optionally seeded from an existing chat). */
export async function POST(req: Request) {
  const { uid, isNew } = await getUserId();
  const body = (await req.json().catch(() => ({}))) as { title?: string; messages?: { role: "user" | "assistant"; content: string; provider?: string; model?: string }[] };
  const seed: RoomMessage[] = (body.messages ?? []).slice(-100).map((m, i) => ({ id: `seed${i}`, role: m.role, content: String(m.content).slice(0, 40_000), provider: m.provider, model: m.model, at: Date.now() - (100 - i) }));
  const room = await createRoom(uid, body.title ?? "Room", seed);
  const res = NextResponse.json({ id: room.id, url: `/room/${room.id}` });
  if (isNew) res.cookies.set(uidCookie(uid));
  return res;
}
