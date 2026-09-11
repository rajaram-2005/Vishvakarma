/**
 * API Route: /api/test-lab
 *
 * GET: Retrieve test failures, regression stats, or composite evaluation score
 * POST: Run the Test Lab regression suite, or record one validated failure
 *
 * The body is validated by `parseTestLabRequest` in `@/core/controlplane/testlab/request`, which lives
 * outside this module because a Next.js route may only export HTTP methods and route config.
 */
import { NextResponse } from "next/server";
import { getUserId, uidCookie } from "@/aetheris/lib/user";
import { failureStats, listFailures, recordFailure } from "@/aetheris/core/controlplane/testlab/database";
import { parseTestLabRequest } from "@/aetheris/core/controlplane/testlab/request";
import { runTestLabSuite } from "@/aetheris/core/controlplane/testlab/runner";
import { computeEvaluationScore } from "@/aetheris/core/controlplane/testlab/scoring";
import { record } from "@/aetheris/core/observability/events";
import { validationError } from "@/aetheris/core/security/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { uid, isNew } = await getUserId();
  const url = new URL(req.url);
  const type = url.searchParams.get("type");

  if (type === "eval") {
    const report = await computeEvaluationScore();
    const res = NextResponse.json({ report });
    if (isNew) res.cookies.set(uidCookie(uid));
    return res;
  }

  const failures = listFailures();
  const stats = failureStats();
  const res = NextResponse.json({ failures, stats });
  if (isNew) res.cookies.set(uidCookie(uid));
  return res;
}

export async function POST(req: Request) {
  const { uid, isNew } = await getUserId();
  const parsed = parseTestLabRequest(await req.json().catch(() => null));

  if (!parsed.ok) {
    const res = NextResponse.json(validationError(parsed.errors), { status: parsed.status });
    if (isNew) res.cookies.set(uidCookie(uid));
    return res;
  }

  if (parsed.value.action === "record_failure") {
    const rec = recordFailure(parsed.value.failure);
    record({ type: "execution", uid, capability: "testlab:record_failure", ok: true, detail: `${rec.testId} ${rec.failureType}/${rec.severity}` });
    const res = NextResponse.json({ failure: rec }, { status: 201 });
    if (isNew) res.cookies.set(uidCookie(uid));
    return res;
  }

  // Run full Test Lab suite
  const suite = await runTestLabSuite();
  const evalReport = await computeEvaluationScore(suite);

  const res = NextResponse.json({ suite, evalReport }, { status: 200 });
  if (isNew) res.cookies.set(uidCookie(uid));
  return res;
}
