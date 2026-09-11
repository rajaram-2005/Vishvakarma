/**
 * GET /api/audit-export?format=json|csv
 *
 * Returns the production observability event log for the user
 * as either JSON or CSV. Filters: type, sinceMs, limit, okOnly.
 */
import { NextResponse, type NextRequest } from "next/server";
import { exportJsonAsync, exportCsvAsync, toCsvString } from "@/aetheris/core/observability/audit-export";
import { getUserId } from "@/aetheris/lib/user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { uid } = await getUserId({ allowAnonymous: true });
  const sp = req.nextUrl.searchParams;
  const format = sp.get("format") ?? "json";
  const type = sp.get("type") ?? undefined;
  const sinceMs = sp.get("sinceMs") ? Number(sp.get("sinceMs")) : undefined;
  const limit = sp.get("limit") ? Number(sp.get("limit")) : undefined;
  const okOnly = sp.get("okOnly") === "1";
  const opts = { type: type as never, sinceMs, limit, okOnly };
  if (format === "csv") {
    const c = await exportCsvAsync(uid, opts);
    const body = toCsvString(c);
    return new NextResponse(body, { status: 200, headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="audit-${uid}-${c.exportedAt}.csv"` } });
  }
  const j = await exportJsonAsync(uid, opts);
  return NextResponse.json(j, { status: 200, headers: { "content-disposition": `attachment; filename="audit-${uid}-${j.exportedAt}.json"` } });
}
