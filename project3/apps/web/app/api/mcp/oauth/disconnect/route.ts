import { NextResponse } from "next/server";
import { readTokens, tokensCookie } from "@/aetheris/lib/mcp/oauth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { id } = (await req.json().catch(() => ({}))) as { id?: string };
  const map = await readTokens();
  if (id) delete map[id];
  const res = NextResponse.json({ ok: true, connected: Object.keys(map) });
  res.cookies.set(tokensCookie(map));
  return res;
}

export async function GET() {
  const map = await readTokens();
  return NextResponse.json({ connected: Object.keys(map) });
}
