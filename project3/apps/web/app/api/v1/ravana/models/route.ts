import { NextResponse } from "next/server";
import { modelPool } from "@/aetheris/core/ravana/routing/model_router";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/ravana/models — role pool: how each RAVANA role maps to the mesh today. */
export async function GET() {
  return NextResponse.json(modelPool());
}
