import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
const safeEqual = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };
import { fire, getAutomation } from "@/aetheris/core/automation/engine";
export const runtime = "nodejs"; export const dynamic = "force-dynamic"; export const maxDuration = 120;
/** Webhook trigger: POST /api/automations/:id/hook?secret=… (or X-Aetheris-Secret header) with any JSON payload. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await getAutomation((await params).id); if (!a || a.trigger.kind !== "webhook") return NextResponse.json({ error: "not found" }, { status: 404 });
  const secret = new URL(req.url).searchParams.get("secret") ?? req.headers.get("x-aetheris-secret"); if (!safeEqual(secret ?? "", a.trigger.secret ?? "")) return NextResponse.json({ error: "bad secret" }, { status: 401 });
  if (!a.enabled) return NextResponse.json({ error: "disabled" }, { status: 409 });
  const payload = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const run = await fire(a, "webhook", payload, { origin: new URL(req.url).origin });
  return NextResponse.json({ run: { id: run.id, status: run.status, stages: run.stages } }, { status: 202 });
}
