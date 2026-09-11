import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cache = new Map<string, { at: number; body: unknown }>();
const TTL = 10 * 60 * 1000;

/**
 * GET /api/ecosystem/gh?q=&limit=
 * Live GitHub discovery for AI tools, agents, MCP servers and models.
 * Repositories are never executed — the flow is discover → analyze
 * → license → security → sandbox → permission → install.
 */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const q = (u.searchParams.get("q") ?? "llm").slice(0, 100);
  const limit = Math.min(Number(u.searchParams.get("limit") ?? 18) || 18, 40);
  const key = `${q}|${limit}`;

  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return NextResponse.json(hit.body);

  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}+in:name,description,topic&sort=stars&order=desc&per_page=${limit}`;

  try {
    const res = await fetch(url, {
      headers: { accept: "application/vnd.github+json", "user-agent": "lumen-studio/1.0" },
      signal: AbortSignal.timeout(9000),
    });
    if (!res.ok) throw new Error(`github: HTTP ${res.status}`);
    const raw = (await res.json()) as { items?: Array<Record<string, unknown>> };
    const repos = (raw.items ?? []).map((r) => {
      const lic = (r.license ?? {}) as Record<string, unknown>;
      return {
        fullName: String(r.full_name ?? ""),
        owner: String((r.owner as Record<string, unknown>)?.login ?? ""),
        description: String(r.description ?? ""),
        language: r.language ?? null,
        stars: Number(r.stargazers_count ?? 0),
        forks: Number(r.forks_count ?? 0),
        openIssues: Number(r.open_issues_count ?? 0),
        license: lic.spdx_id ?? null,
        archived: Boolean(r.archived),
        updatedAt: r.updated_at ?? null,
        url: String(r.html_url ?? ""),
        topics: Array.isArray(r.topics) ? (r.topics as string[]).slice(0, 8) : [],
      };
    });
    const body = { source: "github", live: true, count: repos.length, repos };
    cache.set(key, { at: Date.now(), body });
    return NextResponse.json(body);
  } catch (e) {
    return NextResponse.json(
      {
        source: "github",
        live: false,
        count: 0,
        repos: [],
        error: (e as Error).message,
        hint: "Repository discovery needs a connection. Local tools remain available.",
      },
      { status: 503 },
    );
  }
}
