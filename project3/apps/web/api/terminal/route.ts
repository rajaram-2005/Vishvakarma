/**
 * POST /api/terminal
 *   body: { command: string, timeoutMs?: number, network?: boolean,
 *           maxOutput?: number, confirmationToken?: string }
 *
 *   Runs a single sandboxed command. Requires safe_write or
 *   higher (per the terminal capability's security level),
 *   except for a small set of read-only commands (pwd, date,
 *   env, true, ls, cat, head, tail, grep, wc, find) which are
 *   gated at read_only.
 */
import { NextResponse, type NextRequest } from "next/server";
import { runTerminal } from "@/aetheris/core/automation/terminal";
import { authorize, issueConfirmation, principalFor } from "@/aetheris/core/policy/permissions";
import { getUserId } from "@/aetheris/lib/user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const READ_ONLY_OK = new Set(["pwd", "date", "env", "true", "ls", "cat", "head", "tail", "grep", "wc", "find", "diff"]);

function firstBinary(cmd: string): string {
  const trimmed = cmd.trim();
  if (!trimmed) return "";
  return (trimmed.split(/\s+/)[0] ?? "").split("/").pop() ?? "";
}

export async function POST(req: NextRequest) {
  const { uid } = await getUserId({ allowAnonymous: false });
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const command = String(body.command ?? "");
  const timeoutMs = body.timeoutMs === undefined ? undefined : Math.max(100, Math.min(30_000, Number(body.timeoutMs)));
  const network = body.network === true;
  const maxOutput = body.maxOutput === undefined ? undefined : Math.max(1024, Math.min(256_000, Number(body.maxOutput)));
  const confirmationToken = body.confirmationToken === undefined ? undefined : String(body.confirmationToken);
  const cap = "tool:terminal.run";
  const isReadOnly = READ_ONLY_OK.has(firstBinary(command));
  const required = isReadOnly ? "read_only" as const : "safe_write" as const;
  const principal = principalFor(uid, {});
  const decision = authorize({ principal, capabilityId: cap, required, confirmationToken, requiresConfirmation: !isReadOnly, args: { command } });
  if (!decision.allow) {
    if (decision.code === "needs_confirmation") {
      const token = issueConfirmation(uid, cap);
      return NextResponse.json({ ok: false, needsConfirmation: true, token, reason: decision.reason }, { status: 200 });
    }
    return NextResponse.json({ ok: false, error: decision.reason, code: decision.code }, { status: 403 });
  }
  const r = await runTerminal({ uid, command, timeoutMs, network, maxOutput });
  return NextResponse.json(r, { status: 200 });
}
