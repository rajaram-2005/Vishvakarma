/**
 * Symbolic API — gate agent plans and check unit consistency.
 *   POST /api/symbolic        verify a plan  { steps: [...], initialState?, units?, globalInvariants? }
 *   GET  /api/symbolic        status (what the engine supports)
 */
import { NextResponse } from "next/server";
import { getUserId, uidCookie } from "@/aetheris/lib/user";
import { symbolicStatus, validatePlanShape, verifyPlan, type PlanStep } from "@/aetheris/core/symbolic/constraints";
import { parseExpr, evalExpr } from "@/aetheris/core/symbolic/solver";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { uid, isNew } = await getUserId();
  const res = NextResponse.json({ status: symbolicStatus() });
  if (isNew) res.cookies.set(uidCookie(uid));
  return res;
}

export async function POST(req: Request) {
  const { uid, isNew } = await getUserId();
  const body = (await req.json().catch(() => ({}))) as { steps?: PlanStep[]; initialState?: Record<string, number | string | boolean>; units?: Record<string, string>; globalInvariants?: { expression: string; why: string }[]; expression?: string; variables?: Record<string, number> };
  if (body.expression) {
    // quick evaluate-and-unit-check endpoint for ad-hoc math
    try {
      const e = parseExpr(body.expression);
      const out = evalExpr(e, body.variables ?? {});
      return NextResponse.json({ ok: true, value: out, expression: body.expression });
    } catch (err) { return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 400 }); }
  }
  if (!body.steps || !Array.isArray(body.steps)) return NextResponse.json({ error: "steps is required" }, { status: 400 });
  const shape = validatePlanShape({ steps: body.steps });
  if (!shape.ok) return NextResponse.json({ ok: false, error: shape.reason, step: shape.step }, { status: 400 });
  const verdict = verifyPlan({ steps: body.steps, units: body.units }, { uid, initialState: body.initialState, globalInvariants: body.globalInvariants });
  const res = NextResponse.json({ ok: verdict.kind === "accept", verdict }, { status: verdict.kind === "accept" ? 200 : 409 });
  if (isNew) res.cookies.set(uidCookie(uid));
  return res;
}
