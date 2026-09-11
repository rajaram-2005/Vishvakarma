import { NextResponse } from "next/server";
import { meshStatus } from "@/aetheris/lib/router/router";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const providers = meshStatus();
  const ready = providers.filter((p) => p.state === "ready").length;
  const configured = providers.filter((p) => p.configured).length;
  return NextResponse.json({ total: providers.length, configured, ready, providers });
}
