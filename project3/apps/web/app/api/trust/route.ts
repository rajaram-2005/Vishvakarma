/**
 * POST /api/trust
 *   body: { action: "revoke" | "clear", capabilityId: string,
 *           reason?: string, confirmationToken?: string }
 *
 *   Records a per-uid revocation row, or clears one. The
 *   flow is capability-gated at 'safe_write'. A
 *   confirmation token is required.
 */
import { NextResponse, type NextRequest } from "next/server";
import { recordRevoke, clearRevoke, isRevoked } from "@/aetheris/core/trust/revoke";
import { authorize, issueConfirmation, principalFor } from "@/aetheris/core/policy/permissions";
import { getUserId } from "@/aetheris/lib/user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CAP = "trust:revoke";

export async function POST(req: NextRequest) {
  const { uid } = await getUserId({ allowAnonymous: false });
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const action = body.action === "clear" ? "clear" : "revoke";
  const capabilityId = String(body.capabilityId ?? "");
  if (!capabilityId) return NextResponse.json({ ok: false, error: "capabilityId required" }, { status: 400 });
  const principal = principalFor(uid, {});
  const decision = authorize({ principal, capabilityId: CAP, required: "safe_write", requiresConfirmation: true, confirmationToken: body.confirmationToken ? String(body.confirmationToken) : undefined });
  if (!decision.allow) {
    if (decision.code === "needs_confirmation") {
      const token = issueConfirmation(uid, CAP);
      return NextResponse.json({ ok: false, needsConfirmation: true, token, reason: decision.reason }, { status: 200 });
    }
    return NextResponse.json({ ok: false, error: decision.reason, code: decision.code }, { status: 403 });
  }
  if (action === "clear") {
    const removed = await clearRevoke(uid, capabilityId);
    return NextResponse.json({ ok: true, action, capabilityId, removed }, { status: 200 });
  }
  const reason = body.reason === undefined ? undefined : String(body.reason).slice(0, 200);
  const r = await recordRevoke(uid, capabilityId, { reason });
  return NextResponse.json({ ok: true, action, capabilityId, revoked: r, nowRevoked: await isRevoked(uid, capabilityId) }, { status: 200 });
}

export async function GET() {
  return NextResponse.json({ ok: false, error: "use POST" }, { status: 405 });
}
