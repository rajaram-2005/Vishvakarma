import { NextResponse } from "next/server";
import { getUserId, uidCookie } from "@/aetheris/lib/user";
import { createPayment } from "@/aetheris/lib/billing/payments";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { uid, isNew } = await getUserId();
  const { planId } = (await req.json().catch(() => ({}))) as { planId?: string };
  if (!planId) return NextResponse.json({ error: "planId required" }, { status: 400 });
  try {
    const p = await createPayment(uid, planId);
    const res = NextResponse.json(p);
    if (isNew) res.cookies.set(uidCookie(uid));
    return res;
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
