import { NextResponse } from "next/server";
import { getUserId } from "@/aetheris/lib/user";
import { deleteTwin, getTwin, saveTwin, simulate, syncTwin, twinHealth } from "@/aetheris/core/twins/twins";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };
async function own(id: string) { const { uid } = await getUserId(); const t = await getTwin(id); return t && t.uid === uid ? t : undefined; }
export async function GET(_r: Request, { params }: Ctx) { const t = await own((await params).id); return t ? NextResponse.json({ twin: t, health: twinHealth(t) }) : NextResponse.json({ error: "not found" }, { status: 404 }); }
/** POST {op:"sync"} · {op:"simulate", proposed:{key:value}, steps?} · {op:"event", kind, detail} · {op:"maintenance", note, nextDue?} */
export async function POST(req: Request, { params }: Ctx) {
  const t = await own((await params).id); if (!t) return NextResponse.json({ error: "not found" }, { status: 404 });
  const b = (await req.json().catch(() => ({}))) as { op?: string; proposed?: Record<string, number>; steps?: number; kind?: string; detail?: string; note?: string; nextDue?: number };
  switch (b.op) {
    case "sync": return NextResponse.json({ ...(await syncTwin(t)), state: t.state, health: twinHealth(t) });
    case "simulate": return NextResponse.json({ simulation: simulate(t, b.proposed ?? {}, Math.min(500, b.steps ?? 10)) });
    case "event": t.events.push({ at: Date.now(), kind: b.kind ?? "note", detail: (b.detail ?? "").slice(0, 300) }); await saveTwin(t); return NextResponse.json({ ok: true });
    case "maintenance": t.maintenance.push({ at: Date.now(), note: (b.note ?? "").slice(0, 300), nextDue: b.nextDue }); await saveTwin(t); return NextResponse.json({ ok: true });
    default: return NextResponse.json({ error: "op must be sync|simulate|event|maintenance" }, { status: 400 });
  }
}
export async function PATCH(req: Request, { params }: Ctx) { const t = await own((await params).id); if (!t) return NextResponse.json({ error: "not found" }, { status: 404 }); const b = (await req.json().catch(() => ({}))) as Partial<typeof t>; for (const k of ["name", "kind", "deviceIds", "state", "bounds", "rules", "stepSeconds", "relationships"] as const) if (b[k] !== undefined) (t as unknown as Record<string, unknown>)[k] = b[k]; await saveTwin(t); return NextResponse.json({ twin: t }); }
export async function DELETE(_r: Request, { params }: Ctx) { const { uid } = await getUserId(); return NextResponse.json({ ok: await deleteTwin(uid, (await params).id) }); }
