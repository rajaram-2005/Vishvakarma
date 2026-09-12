import { NextResponse } from "next/server";
import { tick } from "@/aetheris/lib/schedules/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Run all due schedules. Call from any external cron every 5–15 minutes:
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://your-host/api/schedules/tick
 * When CRON_SECRET is unset the endpoint is open (fine for self-host; it only runs what's already due).
 */
async function handle(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}` && new URL(req.url).searchParams.get("secret") !== secret) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const r = await tick(Date.now(), new URL(req.url).origin);
  return NextResponse.json({ ok: true, at: new Date().toISOString(), ...r });
}
export const GET = handle; export const POST = handle;
