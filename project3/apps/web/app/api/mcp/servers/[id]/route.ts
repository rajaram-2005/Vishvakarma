import { NextResponse } from "next/server";
import { getUserId } from "@/aetheris/lib/user";
import { getServer, refresh, removeServer } from "@/aetheris/core/mcp/gateway";
import { store } from "@/aetheris/lib/store";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** GET → server. POST → re-probe (health + manifest). PATCH {enabled?, name?}. DELETE. */
export async function GET(_r: Request, { params }: Ctx) { const { uid } = await getUserId(); const s = await getServer((await params).id); return s && s.uid === uid ? NextResponse.json({ server: s }) : NextResponse.json({ error: "not found" }, { status: 404 }); }
export async function POST(_r: Request, { params }: Ctx) { const { uid } = await getUserId(); const s = await getServer((await params).id); if (!s || s.uid !== uid) return NextResponse.json({ error: "not found" }, { status: 404 }); await refresh(s); await store.set("mcp_servers", s.id, s); return NextResponse.json({ server: s }); }
export async function PATCH(req: Request, { params }: Ctx) { const { uid } = await getUserId(); const s = await getServer((await params).id); if (!s || s.uid !== uid) return NextResponse.json({ error: "not found" }, { status: 404 }); const b = (await req.json().catch(() => ({}))) as { enabled?: boolean; name?: string }; if (typeof b.enabled === "boolean") s.enabled = b.enabled; if (b.name) s.name = b.name.slice(0, 60); s.updatedAt = Date.now(); await store.set("mcp_servers", s.id, s); return NextResponse.json({ server: s }); }
export async function DELETE(_r: Request, { params }: Ctx) { const { uid } = await getUserId(); return NextResponse.json({ ok: await removeServer(uid, (await params).id) }); }
