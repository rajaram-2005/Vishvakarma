import { NextResponse } from "next/server";
import { CATEGORIES, CONNECTORS } from "@/aetheris/lib/mcp/catalog";
import { apiById } from "@/aetheris/lib/gateway/apis";
import { readTokens } from "@/aetheris/lib/mcp/oauth";

export const dynamic = "force-dynamic";

export async function GET() {
  const tokens = await readTokens();
  return NextResponse.json({
    categories: CATEGORIES,
    connected: Object.keys(tokens),
    connectors: CONNECTORS.map((c) => ({
      ...c,
      tools: c.kind === "gateway" ? apiById(c.id)?.tools.map((t) => t.name) ?? [] : undefined,
    })),
  });
}
