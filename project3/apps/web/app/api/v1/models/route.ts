import { NextResponse } from "next/server";
import { MODEL_TIERS } from "@/aetheris/lib/models/tiers";

export const dynamic = "force-dynamic";

/** OpenAI-compatible model list. */
export async function GET() {
  return NextResponse.json({ object: "list", data: MODEL_TIERS.map((t) => ({ id: t.id, object: "model", created: 1735689600, owned_by: "aetheris", min_plan: t.minPlan, description: t.description })) });
}
