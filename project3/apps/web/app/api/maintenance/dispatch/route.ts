/**
 * POST /api/maintenance/dispatch
 *   body: { twinId, windowStart, windowEnd, note,
 *           nextDue?, confirmationToken? }
 *
 *   Writes a maintenance dispatch after validating the
 *   window against the existing calendar and dispatches.
 *   Capability-gated at 'safe_write' with a confirmation
 *   token.
 */
import { NextResponse, type NextRequest } from "next/server";
import { dispatchMaintenance } from "@/aetheris/core/maintenance/dispatch";
import { authorize, issueConfirmation, principalFor } from "@/aetheris/core/policy/permissions";
import { getUserId } from "@/aetheris/lib/user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CAP = "maintenance:dispatch";

export async function POST(req: NextRequest) {
  const { uid } = await getUserId({ allowAnonymous: false });
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const twinId = String(body.twinId ?? "");
  const windowStart = Number(body.windowStart ?? 0);
  const windowEnd = Number(body.windowEnd ?? 0);
  const note = String(body.note ?? "").slice(0, 200);
  const nextDue = body.nextDue === undefined ? undefined : Number(body.nextDue);
  if (!twinId) return NextResponse.json({ ok: false, error: "twinId required" }, { status: 400 });
  if (!Number.isFinite(windowStart) || windowStart <= 0) return NextResponse.json({ ok: false, error: "windowStart required (epoch ms)" }, { status: 400 });
  if (!Number.isFinite(windowEnd) || windowEnd <= windowStart) return NextResponse.json({ ok: false, error: "windowEnd must be > windowStart" }, { status: 400 });
  if (note.length < 3) return NextResponse.json({ ok: false, error: "note must be at least 3 chars" }, { status: 400 });
  const principal = principalFor(uid, {});
  const decision = authorize({ principal, capabilityId: CAP, required: "safe_write", requiresConfirmation: true, confirmationToken: body.confirmationToken ? String(body.confirmationToken) : undefined });
  if (!decision.allow) {
    if (decision.code === "needs_confirmation") {
      const token = issueConfirmation(uid, CAP);
      return NextResponse.json({ ok: false, needsConfirmation: true, token, reason: decision.reason }, { status: 200 });
    }
    return NextResponse.json({ ok: false, error: decision.reason, code: decision.code }, { status: 403 });
  }
  const r = await dispatchMaintenance({ uid, twinId, windowStart, windowEnd, note, nextDue });
  return NextResponse.json(r, { status: r.ok ? 200 : 400 });
}

export async function GET() {
  return NextResponse.json({ ok: false, error: "use POST" }, { status: 405 });
}
