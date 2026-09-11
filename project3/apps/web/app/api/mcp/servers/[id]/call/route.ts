import { NextResponse } from "next/server";
import { getUserId } from "@/aetheris/lib/user";
import { callServerTool, getServer } from "@/aetheris/core/mcp/gateway";
import { authorize, principalFor } from "@/aetheris/core/policy/permissions";
export const runtime = "nodejs"; export const dynamic = "force-dynamic"; export const maxDuration = 120;

/** POST {tool, args, confirmationToken?} → tool result. Permission from the manifest classification; audited. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { uid } = await getUserId(); const s = await getServer((await params).id);
  if (!s || s.uid !== uid) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!s.enabled) return NextResponse.json({ error: "server disabled" }, { status: 400 });
  const b = (await req.json().catch(() => ({}))) as { tool?: string; args?: Record<string, unknown>; confirmationToken?: string };
  const t = s.manifest?.tools.find((x) => x.name === b.tool); if (!t) return NextResponse.json({ error: "unknown tool" }, { status: 404 });
  const d = authorize({ principal: principalFor(uid), capabilityId: `mcpserver:${s.id}.${t.name}`, required: t.permission, requiresConfirmation: t.requiresConfirmation, confirmationToken: b.confirmationToken });
  if (!d.allow) return NextResponse.json({ error: d.reason, code: d.code, permission: t.permission }, { status: 403 });
  try { return NextResponse.json({ result: await callServerTool(s, t.name, b.args ?? {}, req.signal) }); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 502 }); }
}
