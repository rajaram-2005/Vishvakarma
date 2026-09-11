import { NextResponse } from "next/server";
import { getUserId } from "@/aetheris/lib/user";
import { neighbors } from "@/aetheris/core/knowledge/fabric";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
/** GET ?entity=&depth=&workspace= → graph neighbourhood with provenance per edge. */
export async function GET(req: Request) {
  const { uid } = await getUserId(); const u = new URL(req.url); const e = u.searchParams.get("entity");
  if (!e) return NextResponse.json({ error: "entity required" }, { status: 400 });
  try { return NextResponse.json(await neighbors(uid, e, Math.min(3, Number(u.searchParams.get("depth") ?? 1)), u.searchParams.get("workspace") ?? undefined)); }
  catch (err) { return NextResponse.json({ error: (err as Error).message }, { status: 503 }); }
}
