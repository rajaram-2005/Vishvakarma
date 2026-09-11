import { NextResponse } from "next/server";
import { demoStatus, ensureSeeded, isDemoMode } from "@/aetheris/core/demo";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/demo
 *
 * Idempotent: if AETHERIS_DEMO=1 and no seed exists, this writes one.
 * Always returns the current status (enabled, seeded, pinnedProvider, …).
 *
 * Safe to call from the client on first load — it never touches a real
 * user, and it never overwrites existing data.
 */
export async function GET() {
  let created = false;
  if (isDemoMode()) {
    const r = await ensureSeeded();
    created = r.created;
  }
  const status = await demoStatus();
  return NextResponse.json({ ...status, created }, {
    headers: { "cache-control": "no-store" },
  });
}

/** POST /api/demo — same as GET, but allows the client to force a re-seed attempt. */
export async function POST() {
  return GET();
}
