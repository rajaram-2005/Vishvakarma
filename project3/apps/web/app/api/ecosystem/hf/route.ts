import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── in-memory cache: 10 min ────────────────────────────────────────────────
const cache = new Map<string, { at: number; body: unknown }>();
const TTL = 10 * 60 * 1000;

/**
 * GET /api/ecosystem/hf?q=&limit=&type=
 * Live Hugging Face model discovery. The platform never claims a model is
 * downloadable or redistributable — it reports what HF publishes (license,
 * downloads, likes, pipeline tag) and leaves the licensing decision visible.
 */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const q = (u.searchParams.get("q") ?? "llm").slice(0, 100);
  const limit = Math.min(Number(u.searchParams.get("limit") ?? 18) || 18, 40);
  const type = u.searchParams.get("type") ?? "all";
  const key = `${q}|${limit}|${type}`;

  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return NextResponse.json(hit.body);

  const filters = type === "all" ? "" : `&filter=${type}`;
  const url = `https://huggingface.co/api/models?search=${encodeURIComponent(q)}&limit=${limit}&full=true${filters}&sort=downloads&direction=-1`;

  try {
    const res = await fetch(url, {
      headers: { accept: "application/json", "user-agent": "lumen-studio/1.0 (+model-discovery)" },
      signal: AbortSignal.timeout(9000),
    });
    if (!res.ok) throw new Error(`huggingface: HTTP ${res.status}`);
    const raw = (await res.json()) as Array<Record<string, unknown>>;
    const models = raw.map((m) => {
      const card = (m.cardData ?? {}) as Record<string, unknown>;
      const tags: string[] = Array.isArray(m.tags) ? (m.tags as string[]) : [];
      return {
        id: String(m.id ?? m.modelId ?? ""),
        publisher: String((m.author ?? "") as string) || String(m.id).split("/")[0],
        downloads: Number(m.downloads ?? 0),
        likes: Number(m.likes ?? 0),
        license: ((m.cardData as Record<string, unknown>)?.license) ?? null,
        pipelineTag: m.pipeline_tag ?? null,
        language: card.language ?? null,
        tags: tags.slice(0, 6),
        lastModified: m.lastModified ?? null,
        url: `https://huggingface.co/${String(m.id ?? m.modelId)}`,
      };
    });
    const body = { source: "huggingface", live: true, count: models.length, models };
    cache.set(key, { at: Date.now(), body });
    return NextResponse.json(body);
  } catch (e) {
    return NextResponse.json(
      {
        source: "huggingface",
        live: false,
        count: 0,
        models: [],
        error: (e as Error).message,
        hint: "Model discovery needs a connection. Local and connected models remain available.",
      },
      { status: 503 },
    );
  }
}
