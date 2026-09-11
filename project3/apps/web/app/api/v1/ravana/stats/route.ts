import { NextResponse } from "next/server";
import { getUserId } from "@/aetheris/lib/user";
import { stampUid } from "@/aetheris/core/ravana/http";
import { taskStats, engineManifest } from "@/aetheris/core/ravana/engine";
import { counts } from "@/aetheris/core/ravana/memory/manager";
import { bootTools, toolStatus } from "@/aetheris/core/ravana/tools";
import { modelPool } from "@/aetheris/core/ravana/routing/model_router";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/ravana/stats — RAVANA dashboard numbers (spec §24). */
export async function GET() {
  const { uid, isNew } = await getUserId();
  const [stats, memory, manifest] = await Promise.all([taskStats(uid), counts(uid), engineManifest(uid)]);
  bootTools();
  const tools = toolStatus();
  const pool = modelPool();
  return stampUid(
    NextResponse.json({
      online: true,
      subsystemStatus: manifest.subsystems,
      tasks: stats,
      memory: { byType: memory, total: Object.values(memory).reduce((n, x) => n + x, 0) },
      models: { available: pool.roles.filter((r) => r.status === "configured").length, roles: pool.roles },
      tools: { available: tools.length, tools },
    }),
    isNew,
    uid,
  );
}
