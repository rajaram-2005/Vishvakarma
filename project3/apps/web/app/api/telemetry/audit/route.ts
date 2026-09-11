import { NextResponse } from "next/server";
import { getUserId } from "@/aetheris/lib/user";
import { auditExportAsync, toCsv } from "@/aetheris/core/security/guard";
import { isPgEvents } from "@/aetheris/core/observability/events";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
/** GET ?since=&format=csv|json → my own security-relevant audit trail (permission decisions, device/robot actions, executions, MCP calls). Secrets redacted. */
export async function GET(req: Request) {
  const { uid } = await getUserId(); const u = new URL(req.url); const rows = await auditExportAsync(uid, u.searchParams.get("since") ? Number(u.searchParams.get("since")) : undefined);
  if (u.searchParams.get("format") === "csv") return new NextResponse(toCsv(rows as unknown as Record<string, unknown>[]), { headers: { "Content-Type": "text/csv", "Content-Disposition": `attachment; filename="aetheris-audit-${Date.now()}.csv"` } });
  return NextResponse.json({ events: rows, note: isPgEvents() ? "Postgres event log (durable across instances)." : "In-memory ring buffer of this instance (last ~5k events). Configure a log sink for retention." });
}
