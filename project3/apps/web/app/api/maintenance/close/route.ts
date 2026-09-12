/**
 * POST /api/maintenance/close
 *   body: { twinId, at, doneNote?, confirmationToken? }
 *
 *   Closes a maintenance entry by stamping doneAt and an
 *   optional doneNote. Capability-gated at 'safe_write' with
 *   a confirmation token. The entry is identified by its
 *   `at` timestamp; there must be exactly one open match.
 *
 *   The write is honest: it does not silently re-open a
 *   closed entry, and it refuses to close a non-existent
 *   entry. The audit log records the close as a 'tool'
 *   event under capability 'maintenance:close'.
 */
import { NextResponse, type NextRequest } from "next/server";
import { closeMaintenance } from "@/aetheris/core/maintenance/tasks";
import { authorize, issueConfirmation, principalFor } from "@/aetheris/core/policy/permissions";
import { getUserId } from "@/aetheris/lib/user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CAP = "maintenance:close";

export async function POST(req: NextRequest) {
  const { uid } = await getUserId({ allowAnonymous: false });
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const twinId = String(body.twinId ?? "");
  const at = Number(body.at ?? 0);
  const doneNote = body.doneNote === undefined ? undefined : String(body.doneNote).slice(0, 300);
  if (!twinId) return NextResponse.json({ ok: false, error: "twinId required" }, { status: 400 });
  if (!Number.isFinite(at) || at <= 0) return NextResponse.json({ ok: false, error: "at required (epoch ms)" }, { status: 400 });
  const principal = principalFor(uid, {});
  const decision = authorize({ principal, capabilityId: CAP, required: "safe_write", requiresConfirmation: true, confirmationToken: body.confirmationToken ? String(body.confirmationToken) : undefined });
  if (!decision.allow) {
    if (decision.code === "needs_confirmation") {
      const token = issueConfirmation(uid, CAP);
      return NextResponse.json({ ok: false, needsConfirmation: true, token, reason: decision.reason }, { status: 200 });
    }
    return NextResponse.json({ ok: false, error: decision.reason, code: decision.code }, { status: 403 });
  }
  const r = await closeMaintenance({ uid, twinId, at, doneNote });
  return NextResponse.json(r, { status: r.ok ? 200 : 400 });
}

export async function GET() {
  return NextResponse.json({ ok: false, error: "use POST" }, { status: 405 });
}
