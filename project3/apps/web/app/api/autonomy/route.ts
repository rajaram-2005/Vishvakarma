/**
 * POST /api/autonomy
 *
 * Writes the user's requested autonomy level to the
 * `user-config:autonomy:<uid>` collection entry and redirects
 * back to /autonomy.
 */
import { NextResponse, type NextRequest } from "next/server";
import { setAutonomyLevel, type AutonomyLevel } from "@/aetheris/core/autonomy/levels";
import { getUserId } from "@/aetheris/lib/user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const levelRaw = form.get("level");
  const note = (form.get("note") ?? "").toString();
  const level = Number(levelRaw);
  const { uid } = await getUserId({ allowAnonymous: true });
  try {
    if (!Number.isInteger(level) || level < 0 || level > 5) {
      throw new Error("Invalid level");
    }
    await setAutonomyLevel(uid, level as AutonomyLevel, note);
    return NextResponse.redirect(new URL(`/autonomy?ok=1&level=${level}`, req.url), 303);
  } catch (e) {
    const msg = (e as Error).message;
    return NextResponse.redirect(new URL(`/autonomy?err=${encodeURIComponent(msg)}`, req.url), 303);
  }
}
