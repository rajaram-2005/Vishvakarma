/**
 * Lab API — run, deploy, and inspect lab jobs.
 *   POST /api/lab              run a script in the sandbox (or docker if opted in)
 *   GET  /api/lab              status + list of deployed artifacts
 *   DELETE /api/lab?id=...     remove a deployed artifact
 */
import { NextResponse } from "next/server";
import { getUserId, uidCookie } from "@/aetheris/lib/user";
import { listDeployed, labDeployDir, labStatus, runInLab, type LabRequest } from "@/aetheris/core/lab/codesandbox";
import { principalFor } from "@/aetheris/core/policy/permissions";
import { unlink } from "node:fs/promises";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { uid, isNew } = await getUserId();
  const res = NextResponse.json({ status: await labStatus(), deployed: await listDeployed(labDeployDir()) });
  if (isNew) res.cookies.set(uidCookie(uid));
  return res;
}

export async function POST(req: Request) {
  const { uid, isNew } = await getUserId();
  const body = (await req.json().catch(() => ({}))) as Partial<LabRequest> & { confirmationToken?: string };
  if (!body || !body.language || !body.runtime || (!body.source && !body.sourceFiles)) {
    return NextResponse.json({ error: "missing required fields: language, runtime, source|sourceFiles" }, { status: 400 });
  }
  const principal = principalFor(uid, { admin: isAdmin(uid) });
  const r = await runInLab({
    principal,
    description: body.description ?? "lab run",
    language: body.language,
    source: body.source,
    sourceFiles: body.sourceFiles,
    entry: body.entry,
    args: body.args,
    runtime: body.runtime,
    image: body.image,
    mountHostDir: body.mountHostDir,
    mountContainerDir: body.mountContainerDir,
    timeoutMs: body.timeoutMs,
    testCommand: body.testCommand,
    testFiles: body.testFiles,
    deployDir: labDeployDir(),
    network: body.network,
    confirmationToken: body.confirmationToken,
  }, { uid });
  // If a confirmation token was consumed (or refused) and the caller might want
  // to retry, the response should make the policy reason visible.
  const res = NextResponse.json(r, { status: r.ok ? 200 : r.stoppedBecause === "policy_denied" ? 403 : 400 });
  if (isNew) res.cookies.set(uidCookie(uid));
  return res;
}

export async function DELETE(req: Request) {
  const { uid, isNew } = await getUserId();
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  if (!id.startsWith(labDeployDir())) return NextResponse.json({ error: "refusing to delete outside the lab deploy dir" }, { status: 400 });
  try { await unlink(id); } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
  const res = NextResponse.json({ ok: true });
  if (isNew) res.cookies.set(uidCookie(uid));
  return res;
}

function isAdmin(uid: string): boolean { return (process.env.AETHERIS_ADMIN_UIDS ?? "").split(",").map((s) => s.trim()).filter(Boolean).includes(uid); }
