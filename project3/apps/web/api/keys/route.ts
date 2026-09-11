import { NextResponse } from "next/server";
import { getUserId, uidCookie } from "@/aetheris/lib/user";
import { createKey, listKeys, revokeKey } from "@/aetheris/lib/keys/apikeys";
import { planFor } from "@/aetheris/lib/billing/entitlements";
import { maxTierFor, tierById } from "@/aetheris/lib/models/tiers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { uid, isNew } = await getUserId();
  const plan = await planFor(uid);
  const res = NextResponse.json({ keys: await listKeys(uid), limit: plan.apiKeys, plan: plan.id });
  if (isNew) res.cookies.set(uidCookie(uid));
  return res;
}

export async function POST(req: Request) {
  const { uid } = await getUserId();
  const body = await req.json().catch(() => ({})) as { name?: string; model?: string };
  const plan = await planFor(uid);
  const model = tierById(body.model)?.id ?? maxTierFor(plan.id).id;
  try {
    const r = await createKey(uid, body.name ?? "default", model);
    return NextResponse.json(r);
  } catch (e) {
    const err = e as Error & { code?: string };
    return NextResponse.json({ error: err.message, code: err.code }, { status: err.code === "upgrade" ? 402 : 400 });
  }
}

export async function DELETE(req: Request) {
  const { uid } = await getUserId();
  const { id } = await req.json().catch(() => ({})) as { id?: string };
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await revokeKey(uid, id);
  return NextResponse.json({ keys: await listKeys(uid) });
}
