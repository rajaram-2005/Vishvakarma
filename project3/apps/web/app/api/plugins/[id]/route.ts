import { NextResponse } from "next/server";
import { getUserId, uidCookie } from "@/aetheris/lib/user";
import { bootCapabilities } from "@/aetheris/core/capabilities/sources";
import { findPluginCapability, invokePlugin } from "@/aetheris/core/plugins/sdk";
import { authorize, principalFor } from "@/aetheris/core/policy/permissions";
export const runtime = "nodejs"; export const dynamic = "force-dynamic"; export const maxDuration = 60;

/** GET → capability metadata. POST {args, workspace?, confirmationToken?} → handler result; permission from the capability's security_level. */
export async function GET(_r: Request, { params }: { params: Promise<{ id: string }> }) {
  bootCapabilities(); const hit = findPluginCapability(decodeURIComponent((await params).id));
  return hit ? NextResponse.json({ plugin: hit.plugin.id, capability: hit.capability }) : NextResponse.json({ error: "not found" }, { status: 404 });
}
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  bootCapabilities(); const { uid, isNew } = await getUserId(); const id = decodeURIComponent((await params).id);
  const hit = findPluginCapability(id); if (!hit) return NextResponse.json({ error: "not found" }, { status: 404 });
  const b = (await req.json().catch(() => ({}))) as { args?: Record<string, unknown>; workspace?: string; confirmationToken?: string };
  const d = authorize({ principal: principalFor(uid), capabilityId: id, required: hit.capability.security_level, requiresConfirmation: hit.capability.requires_confirmation, confirmationToken: b.confirmationToken });
  if (!d.allow) return NextResponse.json({ error: d.reason, code: d.code, permission: hit.capability.security_level }, { status: 403 });
  try { const res = NextResponse.json({ result: await invokePlugin(id, b.args ?? {}, { uid, workspace: b.workspace, signal: req.signal }) }); if (isNew) res.cookies.set(uidCookie(uid)); return res; }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}
