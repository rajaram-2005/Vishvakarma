import { NextResponse } from "next/server";
import { getUserId, uidCookie } from "@/aetheris/lib/user";
import { listMemory, memorySummary, recall, remember, type MemoryType } from "@/aetheris/core/memory/memory";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";

/** GET ?q=&type=&workspace=&asOf= → recall (or list when no q). POST {type, text, tags?, confidence?, workspace?, ref?, supersedes?} → remember. */
export async function GET(req: Request) {
  const { uid, isNew } = await getUserId(); const u = new URL(req.url); const q = u.searchParams.get("q"); const type = (u.searchParams.get("type") as MemoryType | null) ?? undefined; const ws = u.searchParams.get("workspace") ?? undefined;
  try {
    const body = q ? { items: await recall(uid, q, { types: type ? [type] : undefined, workspace: ws, k: Number(u.searchParams.get("k") ?? 8), asOf: u.searchParams.get("asOf") ? Number(u.searchParams.get("asOf")) : undefined }) } : { items: await listMemory(uid, type, ws), summary: memorySummary() };
    const res = NextResponse.json(body); if (isNew) res.cookies.set(uidCookie(uid)); return res;
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 503 }); }
}
export async function POST(req: Request) {
  const { uid, isNew } = await getUserId();
  const b = (await req.json().catch(() => ({}))) as { type?: MemoryType; text?: string; tags?: string[]; confidence?: number; workspace?: string; ref?: string; supersedes?: string };
  if (!b.text) return NextResponse.json({ error: "text required" }, { status: 400 });
  const type = b.type ?? "semantic"; if (!["episodic", "semantic", "procedural"].includes(type)) return NextResponse.json({ error: "type must be episodic|semantic|procedural (short_term/working are process-local)" }, { status: 400 });
  try { const item = await remember(uid, type as "semantic", b.text, { tags: b.tags, confidence: b.confidence, workspace: b.workspace, ref: b.ref, supersedes: b.supersedes, by: uid }); const res = NextResponse.json({ item }, { status: 201 }); if (isNew) res.cookies.set(uidCookie(uid)); return res; }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 503 }); }
}
