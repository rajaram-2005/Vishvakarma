/**
 * Wind Turbine plan API.
 *   POST /api/windturbine
 *     { op: "plan", twinId?, interventions: [...], stepsPerIntervention?, globalInvariants? }
 *     { op: "canon", id, name, initialState? }    -> creates a canonical WTG twin
 *   GET  /api/windturbine                          -> list the user's canonical wind-turbine twins
 */
import { NextResponse } from "next/server";
import { getUserId, uidCookie } from "@/aetheris/lib/user";
import { createTwin, getTwin, listTwins } from "@/aetheris/core/twins/twins";
import { planAndGate, defaultGlobalInvariants, type InterventionStep } from "@/aetheris/core/windturbine/plan";
import { canonicalTurbineTwin } from "@/aetheris/core/windturbine/model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { uid, isNew } = await getUserId();
  const twins = (await listTwins(uid)).filter((t) => t.kind === "wind-turbine");
  const res = NextResponse.json({ twins: twins.map((t) => ({ id: t.id, name: t.name, kind: t.kind, state: t.state, bounds: t.bounds })) });
  if (isNew) res.cookies.set(uidCookie(uid));
  return res;
}

export async function POST(req: Request) {
  const { uid, isNew } = await getUserId();
  const b = (await req.json().catch(() => ({}))) as
    | { op: "canon"; id: string; name: string; initialState?: Record<string, number | string | boolean>; deviceIds?: string[] }
    | { op: "plan"; twinId?: string; interventions: InterventionStep[]; stepsPerIntervention?: number; globalInvariants?: string[] };
  if (!b || !b.op) return NextResponse.json({ error: "op is required" }, { status: 400 });

  if (b.op === "canon") {
    if (!b.id || !b.name) return NextResponse.json({ error: "id and name are required" }, { status: 400 });
    const draft = canonicalTurbineTwin({ id: b.id, name: b.name, initialState: b.initialState as never, deviceIds: b.deviceIds });
    const twin = await createTwin(uid, draft);
    const res = NextResponse.json({ twin: { id: twin.id, name: twin.name, state: twin.state, bounds: twin.bounds, rules: twin.rules } }, { status: 201 });
    if (isNew) res.cookies.set(uidCookie(uid));
    return res;
  }

  if (b.op === "plan") {
    if (!b.interventions?.length) return NextResponse.json({ error: "interventions is required" }, { status: 400 });
    const twin = b.twinId ? await getTwin(b.twinId) : null;
    if (b.twinId && (!twin || twin.uid !== uid)) return NextResponse.json({ error: "twin not found" }, { status: 404 });
    // When no twin is supplied, run a fresh, canonical, in-memory twin. This lets
    // the API be useful for one-shot planning without a saved asset.
    const runtimeTwin = twin ?? (await createTwin(uid, canonicalTurbineTwin({ id: "adhoc", name: "ad-hoc WTG" })));
    const verdict = planAndGate(runtimeTwin, b.interventions, { stepsPerIntervention: b.stepsPerIntervention, globalInvariants: b.globalInvariants ?? defaultGlobalInvariants(), uid });
    const res = NextResponse.json({ verdict }, { status: verdict.ok ? 200 : 409 });
    if (isNew) res.cookies.set(uidCookie(uid));
    return res;
  }

  return NextResponse.json({ error: "op must be canon|plan" }, { status: 400 });
}
