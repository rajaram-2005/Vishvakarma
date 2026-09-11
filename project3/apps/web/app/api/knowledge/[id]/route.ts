import { NextResponse } from "next/server";
import { getUserId } from "@/aetheris/lib/user";
import { deleteFact, getFact } from "@/aetheris/core/knowledge/fabric";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };
export async function GET(_r: Request, { params }: Ctx) { const { uid } = await getUserId(); const f = await getFact(uid, (await params).id); return f ? NextResponse.json({ fact: f }) : NextResponse.json({ error: "not found" }, { status: 404 }); }
export async function DELETE(_r: Request, { params }: Ctx) { const { uid } = await getUserId(); return NextResponse.json({ ok: await deleteFact(uid, (await params).id) }); }
