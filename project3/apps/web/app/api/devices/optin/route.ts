import { NextResponse } from "next/server";
import { getUserId, uidCookie } from "@/aetheris/lib/user";
import { store } from "@/aetheris/lib/store";
import { record } from "@/aetheris/core/observability/events";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
const ACK = "I understand Aetheris will send commands to my physical hardware and I am responsible for its safe configuration.";
/** Physical permission is never default. POST {acknowledge: exact sentence} grants it to this user; DELETE revokes. */
export async function GET() { const { uid, isNew } = await getUserId(); const res = NextResponse.json({ physical: !!(await store.get(("physical_optin"), uid)), acknowledgement: ACK }); if (isNew) res.cookies.set(uidCookie(uid)); return res; }
export async function POST(req: Request) { const { uid, isNew } = await getUserId(); const b = (await req.json().catch(() => ({}))) as { acknowledge?: string }; if (b.acknowledge !== ACK) return NextResponse.json({ error: "acknowledge must match exactly", acknowledgement: ACK }, { status: 400 }); await store.set("physical_optin", uid, { at: Date.now() }); record({ type: "permission", uid, capability: "physical:optin", ok: true }); const res = NextResponse.json({ physical: true }); if (isNew) res.cookies.set(uidCookie(uid)); return res; }
export async function DELETE() { const { uid } = await getUserId(); await store.remove("physical_optin", uid); record({ type: "permission", uid, capability: "physical:optout", ok: true }); return NextResponse.json({ physical: false }); }
