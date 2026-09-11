import { NextResponse } from "next/server";
import { getUserId, uidCookie } from "@/aetheris/lib/user";
import { authorize, issueConfirmation, principalFor } from "@/aetheris/core/policy/permissions";
import { getCapability } from "@/aetheris/core/capabilities/registry";
import { bootCapabilities } from "@/aetheris/core/capabilities/sources";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";

/**
 * GET → my principal.
 * POST {capabilityId, issue: true} → {token} — the user's explicit confirmation for ONE upcoming call of that capability
 *      (single-use, 5 min, bound to uid + capabilityId; dynamic ids like device:<id>.<cap>, robot:move, mcpserver:<id>.<tool> allowed).
 * POST {capabilityId, confirm?: true, token?} → policy decision (tester; consumes the token).
 */
const DYNAMIC = /^(device:[\w-]+\.[\w-]+|robot:(move|estop)|mcpserver:[\w-]+\.[\w.-]+|github:intelligence\.\w+|browser:agent|execution:server-sandbox|automation:[\w-]+)$/;
export async function GET() { const { uid, isNew } = await getUserId(); const res = NextResponse.json({ principal: principalFor(uid) }); if (isNew) res.cookies.set(uidCookie(uid)); return res; }
export async function POST(req: Request) {
  bootCapabilities();
  const { uid, isNew } = await getUserId(); const p = principalFor(uid);
  const b = (await req.json().catch(() => ({}))) as { capabilityId?: string; confirm?: boolean; token?: string; issue?: boolean };
  if (!b.capabilityId) return NextResponse.json({ error: "capabilityId required" }, { status: 400 });
  if (b.issue) {
    const known = (await getCapability(b.capabilityId)) || DYNAMIC.test(b.capabilityId);
    if (!known) return NextResponse.json({ error: "unknown capability" }, { status: 404 });
    const res = NextResponse.json({ token: issueConfirmation(uid, b.capabilityId), capabilityId: b.capabilityId, expiresInSec: 300 }); if (isNew) res.cookies.set(uidCookie(uid)); return res;
  }
  const cap = await getCapability(b.capabilityId); if (!cap) return NextResponse.json({ error: "unknown capability" }, { status: 404 });
  const token = b.confirm && !b.token ? issueConfirmation(uid, cap.id) : b.token;
  const d = authorize({ principal: p, capabilityId: cap.id, required: cap.security_level, requiresConfirmation: cap.requires_confirmation, confirmationToken: token });
  const res = NextResponse.json({ decision: d, capability: { id: cap.id, security_level: cap.security_level, requires_confirmation: !!cap.requires_confirmation, status: cap.status } }, { status: d.allow ? 200 : 403 }); if (isNew) res.cookies.set(uidCookie(uid)); return res;
}
