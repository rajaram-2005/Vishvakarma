import { NextResponse } from "next/server";
import { SelfTestEngine } from "@/aetheris/core/fabric/selftest";

export const dynamic = "force-dynamic";

/**
 * GET /api/network/selftest
 * Returns the system self-test diagnostic report.
 */
export async function GET() {
  const report = await SelfTestEngine.runSystemCheck();
  return NextResponse.json({
    ok: true,
    report,
  });
}

/**
 * POST /api/network/selftest
 * Forces a fresh deep self-test across all 10 cores, memory, world model, gateway, and safety policies.
 */
export async function POST() {
  const report = await SelfTestEngine.runSystemCheck();
  return NextResponse.json({
    ok: true,
    report,
  });
}
