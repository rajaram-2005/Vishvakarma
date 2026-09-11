import { NextResponse } from "next/server";
import { getUserId } from "@/aetheris/lib/user";
import { getPayment } from "@/aetheris/lib/billing/payments";
import { usageSummary } from "@/aetheris/lib/billing/entitlements";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { uid } = await getUserId();
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const p = await getPayment(uid, id);
  if (!p) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ payment: p, account: await usageSummary(uid) });
}
