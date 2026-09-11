import { NextResponse } from "next/server";
import { bootCapabilities } from "@/aetheris/core/capabilities/sources";
import { routeIntent } from "@/aetheris/core/intent/router";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";

/** POST {text, hasImages?, hasKb?} → IntentPlan (task, mode, agents, connectors, capabilities, override). */
export async function POST(req: Request) {
  bootCapabilities();
  const b = (await req.json().catch(() => ({}))) as { text?: string; hasImages?: boolean; hasKb?: boolean };
  if (!b.text?.trim()) return NextResponse.json({ error: "text required" }, { status: 400 });
  const plan = await routeIntent(b.text.slice(0, 4000), { hasImages: b.hasImages, hasKb: b.hasKb });
  return NextResponse.json({ plan: { ...plan, capabilities: plan.capabilities.map((c) => ({ id: c.id, name: c.name, category: c.category, status: c.status, security_level: c.security_level })) } });
}
