import { NextResponse } from "next/server";
import { isAdmin } from "@/aetheris/lib/billing/admin";
import { decide, listPayments, type PaymentStatus } from "@/aetheris/lib/billing/payments";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!(await isAdmin(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const status = new URL(req.url).searchParams.get("status") as PaymentStatus | null;
  return NextResponse.json({ payments: await listPayments(status ?? undefined) });
}

export async function POST(req: Request) {
  if (!(await isAdmin(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id, approve, note } = (await req.json().catch(() => ({}))) as { id?: string; approve?: boolean; note?: string };
  if (!id || typeof approve !== "boolean") return NextResponse.json({ error: "id and approve required" }, { status: 400 });
  try {
    return NextResponse.json(await decide(id, approve, note));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
