/**
 * API Route: /api/incident
 *
 * GET: Retrieve active Incident Command status
 * POST: Trigger a new incident, or clear the active one
 *
 * The body is validated by `parseIncidentRequest` in `@/core/controlplane/incident/request`, which
 * lives outside this module because a Next.js route may only export HTTP methods and route config.
 * Rejected payloads get an explicit 400/422 naming the offending fields; fields that are merely
 * unusable are dropped and reported back in `ignored`, so the Incident Command screen never silently
 * presents a default as an observation.
 *
 * Scope, stated plainly: the incident engine holds ONE process-global incident (see
 * `src/core/controlplane/incident/command.ts`) modelling a single plant asset, not per-user data. Every
 * trigger and clear is written to the event fabric with the acting uid.
 */
import { NextResponse } from "next/server";
import { getUserId, uidCookie } from "@/aetheris/lib/user";
import { clearIncident, getActiveIncident, triggerIncident } from "@/aetheris/core/controlplane/incident/command";
import { parseIncidentRequest } from "@/aetheris/core/controlplane/incident/request";
import { record } from "@/aetheris/core/observability/events";
import { validationError } from "@/aetheris/core/security/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { uid, isNew } = await getUserId();
  const incident = getActiveIncident();
  const res = NextResponse.json({ incident });
  if (isNew) res.cookies.set(uidCookie(uid));
  return res;
}

export async function POST(req: Request) {
  const { uid, isNew } = await getUserId();
  const parsed = parseIncidentRequest(await req.json().catch(() => null));

  if (!parsed.ok) {
    const res = NextResponse.json(validationError(parsed.errors), { status: parsed.status });
    if (isNew) res.cookies.set(uidCookie(uid));
    return res;
  }

  if (parsed.value.action === "clear") {
    clearIncident();
    record({ type: "device", uid, capability: "incident:clear", ok: true, detail: "incident cleared" });
    const res = NextResponse.json({ cleared: true });
    if (isNew) res.cookies.set(uidCookie(uid));
    return res;
  }

  const incident = triggerIncident(parsed.value.incident);
  record({
    type: "device",
    uid,
    capability: "incident:trigger",
    ok: true,
    detail: `${incident.assetId}/${incident.subsystem} ${incident.severity}`,
    meta: {
      incidentId: incident.incidentId,
      ignoredFields: parsed.value.ignored.length,
      requiresHumanSignoff: incident.recommendedAction.requiresHumanSignoff,
    },
  });
  const res = NextResponse.json({ incident, ignored: parsed.value.ignored });
  if (isNew) res.cookies.set(uidCookie(uid));
  return res;
}
