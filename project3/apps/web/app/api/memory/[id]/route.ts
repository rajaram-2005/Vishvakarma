import { NextResponse } from "next/server";
import { getUserId } from "@/aetheris/lib/user";
import { forget } from "@/aetheris/core/memory/memory";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function DELETE(_r: Request, { params }: { params: Promise<{ id: string }> }) { const { uid } = await getUserId(); return NextResponse.json({ ok: await forget(uid, (await params).id) }); }
