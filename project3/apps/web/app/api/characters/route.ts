import { NextResponse } from "next/server";
import { createCharacter, listCharacters, type CharacterInput } from "@/aetheris/lib/characters";
import { getUserId, uidCookie } from "@/aetheris/lib/user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET → shared curated collection + the current user's private custom characters. */
export async function GET() {
  const { uid, isNew } = await getUserId();
  const characters = await listCharacters(uid);
  const traditions = Array.from(new Set(characters.map((character) => character.tradition))).sort();
  const response = NextResponse.json({ characters, traditions, builtIn: characters.filter((character) => character.builtIn).length });
  if (isNew) response.cookies.set(uidCookie(uid));
  return response;
}

/** POST → create a private character owned by the current browser/account. */
export async function POST(req: Request) {
  const { uid, isNew } = await getUserId();
  const body = (await req.json().catch(() => ({}))) as CharacterInput;
  try {
    const response = NextResponse.json({ character: await createCharacter(uid, body) }, { status: 201 });
    if (isNew) response.cookies.set(uidCookie(uid));
    return response;
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
