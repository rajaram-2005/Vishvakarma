import { NextResponse } from "next/server";
import { AGENTS } from "@/aetheris/lib/agents/catalog";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    total: AGENTS.length,
    agents: AGENTS.map(({ id, name, icon, tier, domain, description, skills, tools, aliases }) => ({ id, name, icon, tier, domain, description, skills, tools: tools ?? [], aliases: aliases ?? [] })),
  });
}
