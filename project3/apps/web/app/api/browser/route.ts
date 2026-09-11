import { NextResponse } from "next/server";
import { getUserId } from "@/aetheris/lib/user";
import { authorize, principalFor } from "@/aetheris/core/policy/permissions";
import { browse, browserStatus } from "@/aetheris/core/browser/agent";
export const runtime = "nodejs"; export const dynamic = "force-dynamic"; export const maxDuration = 300;

/**
 * GET → engine availability (http always; playwright only if installed).
 * POST {goal, startUrl, maxSteps?, allowSubmit?, allow?[], deny?[], preferred?, preferPlaywright?, confirmationToken?} → BrowseResult
 * Read-only browsing is read_only; allowSubmit=true (form posts) needs safe_write + confirmation.
 */
export async function GET() { return NextResponse.json(await browserStatus()); }
export async function POST(req: Request) {
  const { uid } = await getUserId();
  const b = (await req.json().catch(() => ({}))) as { goal?: string; startUrl?: string; maxSteps?: number; allowSubmit?: boolean; allow?: string[]; deny?: string[]; preferred?: string; preferPlaywright?: boolean; confirmationToken?: string };
  if (!b.goal || !b.startUrl) return NextResponse.json({ error: "goal and startUrl required" }, { status: 400 });
  const d = authorize({ principal: principalFor(uid), capabilityId: "browser:agent", required: b.allowSubmit ? "safe_write" : "read_only", requiresConfirmation: !!b.allowSubmit, confirmationToken: b.confirmationToken });
  if (!d.allow) return NextResponse.json({ error: d.reason, code: d.code }, { status: 403 });
  const rx = (a?: string[]) => a?.map((s) => { try { return new RegExp(s, "i"); } catch { return /$^/; } });
  const r = await browse({ goal: b.goal, startUrl: b.startUrl, maxSteps: b.maxSteps, allowSubmit: b.allowSubmit, allow: rx(b.allow), deny: rx(b.deny), preferred: b.preferred, preferPlaywright: b.preferPlaywright });
  return NextResponse.json(r, { status: r.ok ? 200 : 422 });
}
