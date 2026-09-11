import { NextResponse } from "next/server";
import { getUserId } from "@/aetheris/lib/user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/providers/custom/test {baseUrl, key?} — probe an OpenAI-compatible endpoint before
 * adding it: hits GET {baseUrl}/models and lists what the server actually serves, so the add
 * form can offer a real model picker. Honest result: {ok, latencyMs, models: string[], detail}
 * or {ok:false, detail} with a reason, never a fake success.
 */
export async function POST(req: Request) {
  await getUserId();
  const body = (await req.json().catch(() => ({}))) as { baseUrl?: string; key?: string };
  const baseUrl = typeof body.baseUrl === "string" ? body.baseUrl.trim().replace(/\/+$/, "") : "";
  if (!/^https?:\/\/[^\s]+$/i.test(baseUrl)) return NextResponse.json({ ok: false, detail: "enter a valid http(s) URL first" }, { status: 400 });

  const started = Date.now();
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(`${baseUrl}/models`, {
      headers: { Authorization: `Bearer ${typeof body.key === "string" && body.key.trim() ? body.key.trim() : "anonymous"}` },
      signal: ctrl.signal,
      cache: "no-store",
    });
    clearTimeout(t);
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return NextResponse.json({
        ok: false,
        latencyMs: Date.now() - started,
        detail: `endpoint answered ${res.status}${detail ? ` — ${detail.slice(0, 160)}` : ""} (a 404/405 here usually means the URL is the server root; OpenAI-compatible servers expose /v1/models)`,
      });
    }
    const j = (await res.json().catch(() => null)) as { data?: { id?: string }[] } | null;
    const models = Array.isArray(j?.data) ? j.data.map((m) => m.id).filter((x): x is string => typeof x === "string").slice(0, 80) : [];
    if (models.length === 0) return NextResponse.json({ ok: true, latencyMs: Date.now() - started, models: [], detail: "reachable, but no models were listed under /models — you can still add it and type a model name" });
    return NextResponse.json({ ok: true, latencyMs: Date.now() - started, models });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const aborted = /abort/i.test(msg);
    return NextResponse.json({ ok: false, latencyMs: Date.now() - started, detail: aborted ? `no answer within 8s — check that the server is running and the URL is right (${baseUrl})` : `could not reach ${baseUrl} — ${msg.slice(0, 160)}` });
  }
}
