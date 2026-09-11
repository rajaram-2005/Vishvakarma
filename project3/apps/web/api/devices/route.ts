import { NextResponse } from "next/server";
import { getUserId, uidCookie } from "@/aetheris/lib/user";
import { listDevices, physicalSummary, redact, registerDevice, type AdapterKind } from "@/aetheris/core/physical/devices";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";

/** GET → my devices + adapter availability. POST {name, adapter, address, kind?, auth?, capabilities?, interlocks?, stopCommand?, tags?} → register. */
export async function GET() { const { uid, isNew } = await getUserId(); const res = NextResponse.json({ devices: (await listDevices(uid)).map(redact), summary: await physicalSummary() }); if (isNew) res.cookies.set(uidCookie(uid)); return res; }
export async function POST(req: Request) {
  const { uid, isNew } = await getUserId();
  const b = (await req.json().catch(() => ({}))) as Parameters<typeof registerDevice>[1];
  if (!b?.name || !b.adapter || !b.address) return NextResponse.json({ error: "name, adapter, address required" }, { status: 400 });
  if (!["http", "mqtt", "modbus", "serial", "opcua", "can", "ros2", "simulated"].includes(b.adapter as AdapterKind)) return NextResponse.json({ error: "unknown adapter" }, { status: 400 });
  try { const d = await registerDevice(uid, b); const res = NextResponse.json({ device: redact(d), note: d.health.state === "error" ? d.health.lastError : undefined }, { status: 201 }); if (isNew) res.cookies.set(uidCookie(uid)); return res; }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}
