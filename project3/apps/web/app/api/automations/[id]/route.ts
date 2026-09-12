import { NextResponse } from "next/server";
import { getUserId } from "@/aetheris/lib/user";
import { deleteAutomation, fire, getAutomation, listRuns, saveAutomation, type Automation } from "@/aetheris/core/automation/engine";
export const runtime = "nodejs"; export const dynamic = "force-dynamic"; export const maxDuration = 120;
type Ctx = { params: Promise<{ id: string }> };
async function own(id: string) { const { uid } = await getUserId(); const a = await getAutomation(id); return { uid, a: a && a.uid === uid ? a : undefined }; }
/** GET → automation + runs (webhook secret shown in full here so the owner can configure the sender). */
export async function GET(_r: Request, { params }: Ctx) { const { a } = await own((await params).id); if (!a) return NextResponse.json({ error: "not found" }, { status: 404 }); return NextResponse.json({ automation: a, runs: await listRuns(a.uid, a.id), hookUrl: a.trigger.kind === "webhook" ? `/api/automations/${a.id}/hook?secret=${a.trigger.secret}` : undefined }); }
/** POST {payload?} → run now (manual trigger). */
export async function POST(req: Request, { params }: Ctx) { const { a } = await own((await params).id); if (!a) return NextResponse.json({ error: "not found" }, { status: 404 }); const b = (await req.json().catch(() => ({}))) as { payload?: Record<string, unknown> }; return NextResponse.json({ run: await fire(a, "manual", b.payload ?? { at: Date.now() }, { origin: new URL(req.url).origin }) }); }
export async function PUT(req: Request, { params }: Ctx) { const { uid, a } = await own((await params).id); if (!a) return NextResponse.json({ error: "not found" }, { status: 404 }); const b = (await req.json().catch(() => ({}))) as Partial<Automation>; try { return NextResponse.json({ automation: await saveAutomation(uid, { ...a, ...b, name: b.name ?? a.name, trigger: b.trigger ?? a.trigger }, a.id) }); } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); } }
export async function DELETE(_r: Request, { params }: Ctx) { const { uid } = await getUserId(); return NextResponse.json({ ok: await deleteAutomation(uid, (await params).id) }); }
