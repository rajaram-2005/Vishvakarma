/**
 * POST /api/twins/edit
 *
 * JSON body: { op: "setName"|"setState"|"addBound"|"removeBound"|"addRule"|"addMaintenance", id, …args }
 * Returns the result of the mutation.
 */
import { NextResponse, type NextRequest } from "next/server";
import { setName, setState, addBound, removeBound, addRule, addMaintenance } from "@/aetheris/core/twins/edit";
import { getUserId } from "@/aetheris/lib/user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { uid } = await getUserId({ allowAnonymous: true });
  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; } catch { return NextResponse.json({ ok: false, reason: "invalid json" }, { status: 400 }); }
  const op = String(body["op"] ?? "");
  const id = String(body["id"] ?? "");
  if (!id) return NextResponse.json({ ok: false, reason: "missing id" }, { status: 400 });
  let r;
  switch (op) {
    case "setName": r = await setName(uid, id, String(body["name"] ?? "")); break;
    case "setState": r = await setState(uid, id, String(body["key"] ?? ""), body["value"] as number | string | boolean); break;
    case "addBound": r = await addBound(uid, id, body["bound"] as { key: string; min?: number; max?: number; unit?: string; critical?: boolean }); break;
    case "removeBound": r = await removeBound(uid, id, String(body["key"] ?? "")); break;
    case "addRule": r = await addRule(uid, id, { target: String(body["target"] ?? ""), expr: String(body["expr"] ?? "") }); break;
    case "addMaintenance": r = await addMaintenance(uid, id, String(body["note"] ?? ""), body["nextDue"] ? Number(body["nextDue"]) : undefined); break;
    default: return NextResponse.json({ ok: false, reason: `unknown op: ${op}` }, { status: 400 });
  }
  if (!r.ok) return NextResponse.json(r, { status: 400 });
  return NextResponse.json(r);
}
