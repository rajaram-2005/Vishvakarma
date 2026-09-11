import { NextRequest, NextResponse } from "next/server";
import { eventFabric } from "@/aetheris/core/fabric/events";
import type { EventCategory, MotionPriority } from "@/aetheris/core/fabric/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/network/events
 * Returns recent events with optional priority or category filtering.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "50", 10)));
  const category = searchParams.get("category") as EventCategory | null;
  const priority = searchParams.get("priority") as MotionPriority | null;

  let events = eventFabric.getRecentEvents(limit, category || undefined);

  if (priority) {
    events = events.filter((e) => e.priority === priority);
  }

  return NextResponse.json({
    ok: true,
    total: events.length,
    events,
  });
}

/**
 * POST /api/network/events
 * Ingests a new typed event into the central fabric.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const ev = eventFabric.emit({
      type: body.type || "telemetry.received",
      category: body.category || "telemetry",
      priority: body.priority || "P3",
      sourceId: body.sourceId || "api-inbound",
      targetId: body.targetId,
      payload: body.payload || {},
      visualAction: body.visualAction,
    });

    return NextResponse.json({
      ok: true,
      event: ev,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
