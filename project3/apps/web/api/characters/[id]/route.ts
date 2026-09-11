import { NextResponse } from "next/server";
import { deleteCharacter, getCharacter, updateCharacter, type CharacterInput } from "@/aetheris/lib/characters";
import { getUserId, uidCookie } from "@/aetheris/lib/user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Context) {
  const { uid, isNew } = await getUserId();
  const character = await getCharacter(uid, (await params).id);
  if (!character) return NextResponse.json({ error: "character not found" }, { status: 404 });
  const response = NextResponse.json({ character });
  if (isNew) response.cookies.set(uidCookie(uid));
  return response;
}

/** Built-in characters are curated and immutable; only the owner's custom records can be edited. */
export async function PATCH(req: Request, { params }: Context) {
  const { uid } = await getUserId();
  const body = (await req.json().catch(() => ({}))) as CharacterInput;
  try {
    const character = await updateCharacter(uid, (await params).id, body);
    return character ? NextResponse.json({ character }) : NextResponse.json({ error: "custom character not found" }, { status: 404 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}

export async function DELETE(_req: Request, { params }: Context) {
  const { uid } = await getUserId();
  const ok = await deleteCharacter(uid, (await params).id);
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "custom character not found" }, { status: 404 });
}
