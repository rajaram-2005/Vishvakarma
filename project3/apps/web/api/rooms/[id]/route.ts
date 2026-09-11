import { NextResponse } from "next/server";
import { getUserId, uidCookie } from "@/aetheris/lib/user";
import { getSessionAccount } from "@/aetheris/lib/auth/accounts";
import { activeParticipants, getRoom, touchPresence } from "@/aetheris/lib/rooms/rooms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET → room snapshot + registers presence. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { uid, isNew } = await getUserId();
  const acc = await getSessionAccount();
  const name = new URL(req.url).searchParams.get("name") ?? acc?.name ?? acc?.email?.split("@")[0] ?? undefined;
  if (!(await getRoom(id))) return NextResponse.json({ error: "room not found" }, { status: 404 });
  const room = await touchPresence(id, uid, name ?? undefined);
  const res = NextResponse.json({ id: room.id, title: room.title, messages: room.messages, participants: activeParticipants(room), seq: room.seq, me: room.participants[uid], owner: room.ownerUid === uid });
  if (isNew) res.cookies.set(uidCookie(uid));
  return res;
}
