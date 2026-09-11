import { NextResponse } from "next/server";
import { store } from "@/aetheris/lib/store";
import type { SharedChat } from "@/app/api/share/route";

export const dynamic = "force-dynamic";
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await store.get<SharedChat>("shares", (await params).id);
  if (!s) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ title: s.title, messages: s.messages });
}
