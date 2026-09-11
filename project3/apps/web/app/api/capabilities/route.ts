import { NextResponse } from "next/server";
import { bootCapabilities } from "@/aetheris/core/capabilities/sources";
import { getCapability, registrySummary, searchCapabilities } from "@/aetheris/core/capabilities/registry";
import type { CapabilityCategory, CapabilityStatus, SecurityLevel } from "@/aetheris/core/capabilities/types";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";

/** GET ?q=&category=&status=a,b&tags=a,b&maxSecurity=&id=&limit= — Capability Registry search. */
export async function GET(req: Request) {
  bootCapabilities();
  const u = new URL(req.url); const id = u.searchParams.get("id");
  if (id) { const c = await getCapability(id); return c ? NextResponse.json({ capability: c }) : NextResponse.json({ error: "not found" }, { status: 404 }); }
  const list = (k: string) => u.searchParams.get(k)?.split(",").filter(Boolean);
  const items = await searchCapabilities({ q: u.searchParams.get("q") ?? undefined, category: list("category") as CapabilityCategory[] | undefined, status: list("status") as CapabilityStatus[] | undefined, tags: list("tags"), maxSecurity: (u.searchParams.get("maxSecurity") as SecurityLevel) || undefined, limit: Number(u.searchParams.get("limit") ?? 50) });
  return NextResponse.json({ summary: await registrySummary(), count: items.length, capabilities: items });
}
