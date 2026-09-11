/**
 * GET /api/v1/ravana/episodes
 *
 *   List / export finished RAVANA tasks as an episode ledger.
 *
 *   Query:
 *     ?limit=50
 *     &status=completed,failed
 *     &kind=coding,math
 *     &since=<unix-ms>
 *     &project_id=
 *     &id=<rvn_…>          → single episode detail
 *     &format=json|csv     → export (default json list)
 *
 *   Read-only. Scoped to the caller's uid. Live/running tasks are never
 *   included. The response carries an honest notes block that names what
 *   the ledger proves and does not prove.
 */
import { NextResponse } from "next/server";
import { getUserId } from "@/aetheris/lib/user";
import { stampUid } from "@/aetheris/core/ravana/http";
import {
  EPISODE_STATUSES,
  exportEpisodesCsv,
  exportEpisodesJson,
  getEpisode,
  listEpisodes,
  toCsvString,
  type EpisodeListOpts,
} from "@/aetheris/core/ravana/episodes";
import type { RavanaKind, RavanaTaskStatus } from "@/aetheris/core/ravana/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_STATUS = new Set<RavanaTaskStatus>(EPISODE_STATUSES);
const ALLOWED_KIND = new Set<RavanaKind>(["chat", "analysis", "research", "coding", "math", "vision", "build"]);

function parseOpts(u: URL): EpisodeListOpts {
  const status = (u.searchParams.get("status") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is RavanaTaskStatus => ALLOWED_STATUS.has(s as RavanaTaskStatus));
  const kind = (u.searchParams.get("kind") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is RavanaKind => ALLOWED_KIND.has(s as RavanaKind));
  const sinceRaw = u.searchParams.get("since");
  const sinceMs = sinceRaw && Number.isFinite(Number(sinceRaw)) ? Number(sinceRaw) : undefined;
  const limitRaw = Number(u.searchParams.get("limit") ?? 50);
  const limit = Number.isFinite(limitRaw) ? limitRaw : 50;
  const projectId = u.searchParams.has("project_id") ? u.searchParams.get("project_id") : undefined;
  return {
    limit,
    status: status.length ? status : undefined,
    kind: kind.length ? kind : undefined,
    sinceMs,
    projectId,
  };
}

export async function GET(req: Request) {
  const { uid, isNew } = await getUserId();
  const u = new URL(req.url);

  // Single-episode detail
  const id = u.searchParams.get("id");
  if (id) {
    const ep = await getEpisode(uid, id);
    if (!ep) {
      return stampUid(NextResponse.json({ error: "episode not found or not terminal" }, { status: 404 }), isNew, uid);
    }
    return stampUid(NextResponse.json({ episode: ep }), isNew, uid);
  }

  const opts = parseOpts(u);
  const format = (u.searchParams.get("format") ?? "list").toLowerCase();

  if (format === "csv") {
    const csv = await exportEpisodesCsv(uid, opts);
    const body = toCsvString(csv);
    const res = new NextResponse(body, {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="ravana-episodes-${uid.slice(0, 8)}.csv"`,
        "cache-control": "no-store",
      },
    });
    return stampUid(res, isNew, uid);
  }

  if (format === "json") {
    const bundle = await exportEpisodesJson(uid, opts);
    return stampUid(NextResponse.json(bundle), isNew, uid);
  }

  // Default: list view payload (same shape the /episodes page consumes).
  const list = await listEpisodes(uid, opts);
  return stampUid(NextResponse.json(list), isNew, uid);
}
