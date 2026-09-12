import { NextResponse } from "next/server";
import { getUserId, uidCookie } from "@/aetheris/lib/user";
import { getStoredCreds, setStoredCred } from "@/aetheris/lib/mcp/hub";
import { connectorById } from "@/aetheris/lib/mcp/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET → connector ids with a stored credential. POST {id, credential|null} → store/remove (sealed at rest). */
export async function GET() {
  const { uid, isNew } = await getUserId();
  const res = NextResponse.json({ stored: Object.keys(await getStoredCreds(uid)) });
  if (isNew) res.cookies.set(uidCookie(uid));
  return res;
}

export async function POST(req: Request) {
  const { uid, isNew } = await getUserId();
  const { id, credential } = (await req.json().catch(() => ({}))) as { id?: string; credential?: string | null };
  if (!id || !connectorById(id)) return NextResponse.json({ error: "unknown connector" }, { status: 400 });
  const stored = await setStoredCred(uid, id, credential && credential.trim() ? credential.trim().slice(0, 4000) : null);
  const res = NextResponse.json({ stored });
  if (isNew) res.cookies.set(uidCookie(uid));
  return res;
}
