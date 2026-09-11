import { NextResponse } from "next/server";
import { bootTools, toolStatus } from "@/aetheris/core/ravana/tools";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/ravana/tools — unified tool protocol catalog with the permission policy per tool. */
export async function GET() {
  bootTools();
  const tools = toolStatus();
  return NextResponse.json({
    count: tools.length,
    policy: {
      model: "LLM → tool request → policy engine → permission check → sandbox → execution → result",
      defaultGrants: "read_only + safe_write (per-user); full_workspace tools require an explicit confirmation token",
      denied: "filesystem access outside the RAVANA workspace · sudo · unrestricted shell · network by default",
      confirmations: "single-use tokens bound to uid + tool capability, 10-minute TTL",
    },
    tools,
  });
}
