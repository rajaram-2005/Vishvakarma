import { NextResponse } from "next/server";
import { getUserId } from "@/aetheris/lib/user";
import { store } from "@/aetheris/lib/store";
import { authorize, principalFor } from "@/aetheris/core/policy/permissions";
import { actuate, estop, getDevice, ingestTelemetry, readDevice, redact, removeDevice, resetLatch, telemetryFor, updateDevice, validateActuation } from "@/aetheris/core/physical/devices";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };
async function own(id: string) { const { uid } = await getUserId(); const d = await getDevice(id); return d && d.uid === uid ? { uid, d } : { uid, d: undefined }; }
async function physicalPrincipal(uid: string) { const p = principalFor(uid); if (await store.get("physical_optin", uid)) p.grants.push("physical"); return p; }

/** GET ?telemetry=1&since= → device (+telemetry). */
export async function GET(req: Request, { params }: Ctx) { const { d } = await own((await params).id); if (!d) return NextResponse.json({ error: "not found" }, { status: 404 }); const u = new URL(req.url); return NextResponse.json({ device: redact(d), telemetry: u.searchParams.get("telemetry") ? await telemetryFor(d.id, u.searchParams.get("since") ? Number(u.searchParams.get("since")) : undefined) : undefined }); }
/**
 * POST {op:"read"} → poll now · {op:"ingest", values} → push telemetry (device → Aetheris, uses device auth.ingestToken if set)
 *      {op:"validate", capability, value} → dry-run safety verdict (read_only)
 *      {op:"actuate", capability, value, confirmationToken} → safety loop; needs `physical` grant + confirmation
 *      {op:"estop"} → latch + stop command (physical grant, no confirmation needed — stopping is always allowed)
 *      {op:"reset"} → clear latch (physical grant + confirmation)
 */
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params; const b = (await req.json().catch(() => ({}))) as { op?: string; capability?: string; value?: unknown; values?: Record<string, number | string | boolean>; confirmationToken?: string; ingestToken?: string };
  if (b.op === "ingest") { const d = await getDevice(id); if (!d) return NextResponse.json({ error: "not found" }, { status: 404 }); const tok = d.auth?.ingestToken ?? req.headers.get("x-device-token") ?? undefined; if (d.auth?.ingestToken && (b.ingestToken ?? req.headers.get("x-device-token")) !== d.auth.ingestToken) return NextResponse.json({ error: "bad ingest token" }, { status: 401 }); if (!d.auth?.ingestToken) { const { uid } = await getUserId(); if (uid !== d.uid) return NextResponse.json({ error: "not found" }, { status: 404 }); } void tok; if (!b.values) return NextResponse.json({ error: "values required" }, { status: 400 }); return NextResponse.json({ telemetry: await ingestTelemetry(d, b.values) }); }
  const { uid, d } = await own(id); if (!d) return NextResponse.json({ error: "not found" }, { status: 404 });
  try {
    switch (b.op) {
      case "read": return NextResponse.json({ telemetry: await readDevice(d), health: d.health });
      case "validate": if (!b.capability) return NextResponse.json({ error: "capability required" }, { status: 400 }); return NextResponse.json({ verdict: validateActuation(d, b.capability, b.value, (await telemetryFor(d.id)).at(-1)?.values) });
      case "actuate": {
        if (!b.capability) return NextResponse.json({ error: "capability required" }, { status: 400 });
        const dec = authorize({ principal: await physicalPrincipal(uid), capabilityId: `device:${d.id}.${b.capability}`, required: "physical", requiresConfirmation: true, confirmationToken: b.confirmationToken });
        if (!dec.allow) return NextResponse.json({ error: dec.reason, code: dec.code, hint: dec.code === "insufficient_level" ? "POST /api/devices/optin first" : "POST /api/permissions {capabilityId, confirm:true} for a token" }, { status: 403 });
        return NextResponse.json(await actuate(d, b.capability, b.value, { by: uid }));
      }
      case "estop": { const dec = authorize({ principal: await physicalPrincipal(uid), capabilityId: `device:${d.id}.estop`, required: "physical", stopAction: true }); if (!dec.allow) return NextResponse.json({ error: dec.reason, code: dec.code }, { status: 403 }); return NextResponse.json(await estop(d, uid)); }
      case "reset": { const dec = authorize({ principal: await physicalPrincipal(uid), capabilityId: `device:${d.id}.reset`, required: "physical", requiresConfirmation: true, confirmationToken: b.confirmationToken }); if (!dec.allow) return NextResponse.json({ error: dec.reason, code: dec.code }, { status: 403 }); await resetLatch(d); return NextResponse.json({ latched: false }); }
      default: return NextResponse.json({ error: "op must be read|ingest|validate|actuate|estop|reset" }, { status: 400 });
    }
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 502 }); }
}
export async function PATCH(req: Request, { params }: Ctx) { const { d } = await own((await params).id); if (!d) return NextResponse.json({ error: "not found" }, { status: 404 }); const b = (await req.json().catch(() => ({}))) as Partial<typeof d>; for (const k of ["name", "kind", "address", "auth", "capabilities", "interlocks", "stopCommand", "tags", "twinId"] as const) if (b[k] !== undefined) (d as unknown as Record<string, unknown>)[k] = b[k]; return NextResponse.json({ device: redact(await updateDevice(d)) }); }
export async function DELETE(_r: Request, { params }: Ctx) { const { uid } = await getUserId(); return NextResponse.json({ ok: await removeDevice(uid, (await params).id) }); }
