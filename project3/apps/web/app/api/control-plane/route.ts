/**
 * API Route: /api/control-plane
 *
 * GET: List the caller's tasks, or retrieve one by ?id=...
 * POST: Execute a new task through the 12-Phase Gated Intelligence Pipeline
 *
 * The POST body is validated by `parseControlPlaneRequest` in `@/core/controlplane/request`. It lives
 * there rather than here because a Next.js route module may only export HTTP methods and route config.
 */
import { NextResponse } from "next/server";
import { getUserId, uidCookie } from "@/aetheris/lib/user";
import { ControlPlaneSupervisor } from "@/aetheris/core/controlplane/supervisor";
import { parseControlPlaneRequest } from "@/aetheris/core/controlplane/request";
import { validationError } from "@/aetheris/core/security/validate";

export async function GET(req: Request) {
  const { uid, isNew } = await getUserId();
  const url = new URL(req.url);
  const id = url.searchParams.get("id");

  if (id) {
    // Ownership is derived from the authenticated identity, never from the query string: a task that
    // belongs to another uid is reported as not found rather than forbidden.
    const task = ControlPlaneSupervisor.getTask(id, uid);
    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }
    const res = NextResponse.json({ task });
    if (isNew) res.cookies.set(uidCookie(uid));
    return res;
  }

  const tasks = ControlPlaneSupervisor.listTasks(uid);
  const res = NextResponse.json({ tasks });
  if (isNew) res.cookies.set(uidCookie(uid));
  return res;
}

export async function POST(req: Request) {
  const { uid, isNew } = await getUserId();
  const raw = await req.json().catch(() => ({}));
  const parsed = parseControlPlaneRequest(raw);

  if (!parsed.ok) {
    const res = NextResponse.json(validationError(parsed.errors), { status: parsed.status });
    if (isNew) res.cookies.set(uidCookie(uid));
    return res;
  }

  const task = await ControlPlaneSupervisor.executeTask(parsed.value.request, {
    uid,
    maxLoopbacks: parsed.value.maxLoopbacks,
    injectedFailure: parsed.value.injectedFailure,
  });

  const res = NextResponse.json({ task }, { status: 200 });
  if (isNew) res.cookies.set(uidCookie(uid));
  return res;
}
