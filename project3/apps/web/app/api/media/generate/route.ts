import { NextResponse } from "next/server";
import { generateMedia } from "@/aetheris/lib/media/router";
import { MediaError, type MediaKind } from "@/aetheris/lib/media/types";
import { getUserId } from "@/aetheris/lib/user";
import { consumeChat, hasFeature } from "@/aetheris/lib/billing/entitlements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    kind?: MediaKind; prompt?: string; keys?: Record<string, string>; preferred?: string; voice?: string;
  };
  if (!body.kind || !["image", "audio", "video"].includes(body.kind)) return NextResponse.json({ error: "kind must be image|audio|video" }, { status: 400 });
  const prompt = body.prompt?.trim();
  if (!prompt) return NextResponse.json({ error: "prompt required" }, { status: 400 });
  if (prompt.length > 4000) return NextResponse.json({ error: "prompt too long" }, { status: 413 });

  const { uid } = await getUserId();
  // Video is a Pro Max feature — unless the user brings their own key (their credits, their call).
  if (body.kind === "video") {
    const byok = Boolean(body.keys?.luma || body.keys?.runway);
    if (!byok && !(await hasFeature(uid, "video"))) {
      return NextResponse.json({ error: "Video generation is included in Pro Max and God Mode (or bring your own Luma/Runway key).", code: "upgrade", feature: "video" }, { status: 402 });
    }
  }
  const quota = await consumeChat(uid, body.kind === "video" ? 5 : 2, "media");
  if (!quota.allowed) return NextResponse.json({ error: `Daily credit limit reached (${quota.limit}). Upgrade for more generations.`, code: "quota" }, { status: 402 });

  try {
    const r = await generateMedia({ kind: body.kind, prompt, userKeys: body.keys, preferred: body.preferred, voice: body.voice, signal: req.signal });
    return NextResponse.json(r);
  } catch (e) {
    const status = e instanceof MediaError ? e.status ?? 502 : 500;
    const attempts = (e as { attempts?: unknown }).attempts;
    return NextResponse.json({ error: (e as Error).message, attempts }, { status });
  }
}
