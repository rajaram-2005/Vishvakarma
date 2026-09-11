import { NextResponse } from "next/server";
import { getUserId, uidCookie } from "@/aetheris/lib/user";
import { listAutomations, listRuns, saveAutomation, type Automation } from "@/aetheris/core/automation/engine";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
/** GET → my automations + recent runs. POST {name, trigger, condition?, agent?, verify?, actions, enabled?, physicalToken?} → create. */
export async function GET() { const { uid, isNew } = await getUserId(); const res = NextResponse.json({ automations: (await listAutomations(uid)).map(redact), runs: await listRuns(uid, undefined, 30) }); if (isNew) res.cookies.set(uidCookie(uid)); return res; }
export async function POST(req: Request) { const { uid, isNew } = await getUserId(); const b = (await req.json().catch(() => ({}))) as Partial<Automation> & Pick<Automation, "name" | "trigger">; try { const a = await saveAutomation(uid, b); const res = NextResponse.json({ automation: a }, { status: 201 }); if (isNew) res.cookies.set(uidCookie(uid)); return res; } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); } }
const redact = (a: Automation) => ({ ...a, physicalToken: a.physicalToken ? "•••" : undefined, trigger: a.trigger.kind === "webhook" ? { ...a.trigger, secret: a.trigger.secret.slice(0, 4) + "…" } : a.trigger });
