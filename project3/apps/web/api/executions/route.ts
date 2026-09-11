import { NextResponse } from "next/server";
import { getUserId, uidCookie } from "@/aetheris/lib/user";
import { execute, sandboxStatus } from "@/aetheris/core/execution/sandbox";
import { authorize, principalFor } from "@/aetheris/core/policy/permissions";
export const runtime = "nodejs"; export const dynamic = "force-dynamic"; export const maxDuration = 120;

/** GET → sandbox status. POST {command, files?, timeoutMs?, network?, confirmationToken?} → ExecResult.
 *  Server execution is `full_workspace`: it needs a confirmation token (POST /api/permissions {capabilityId:"execution:server-sandbox", confirm:true}). */
export async function GET() { return NextResponse.json(await sandboxStatus()); }
export async function POST(req: Request) {
  const { uid, isNew } = await getUserId();
  const b = (await req.json().catch(() => ({}))) as { command?: string; files?: Record<string, string>; timeoutMs?: number; network?: boolean; confirmationToken?: string };
  if (!b.command) return NextResponse.json({ error: "command required" }, { status: 400 });
  const d = authorize({ principal: principalFor(uid), capabilityId: "execution:server-sandbox", required: "full_workspace", confirmationToken: b.confirmationToken });
  if (!d.allow) return NextResponse.json({ error: d.reason, code: d.code }, { status: 403 });
  const r = await execute({ command: b.command, files: b.files, timeoutMs: Math.min(b.timeoutMs ?? 30_000, 110_000), network: b.network === true }, { uid });
  const res = NextResponse.json(r, { status: r.error && !r.exitCode ? 400 : 200 }); if (isNew) res.cookies.set(uidCookie(uid)); return res;
}
