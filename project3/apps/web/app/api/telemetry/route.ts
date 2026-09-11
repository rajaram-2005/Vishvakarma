import { NextResponse } from "next/server";
import { getUserId, uidCookie } from "@/aetheris/lib/user";
import { queryAsync, summaryAsync, type EventType } from "@/aetheris/core/observability/events";
import { meshStatus } from "@/aetheris/lib/router/router";
import { hubSummary } from "@/aetheris/lib/mcp/hub";
import { principalFor } from "@/aetheris/core/policy/permissions";
import { bootCapabilities } from "@/aetheris/core/capabilities/sources";
import { registrySummary } from "@/aetheris/core/capabilities/registry";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";

/** GET ?type=&limit=&errors=1 — Control Center feed. Users see their own events; admins see all. */
export async function GET(req: Request) {
  bootCapabilities();
  const { uid, isNew } = await getUserId(); const p = principalFor(uid); const admin = p.grants.includes("admin");
  const u = new URL(req.url);
  const events = await queryAsync({ type: (u.searchParams.get("type") as EventType) || undefined, uid: admin ? undefined : uid, limit: Number(u.searchParams.get("limit") ?? 100), okOnly: u.searchParams.get("errors") ? false : undefined });
  const mesh = meshStatus();
  const res = NextResponse.json({ admin, principal: p, summary: await summaryAsync(), events, registry: await registrySummary(), mesh: { ready: mesh.filter((m) => m.state === "ready").length, cooldown: mesh.filter((m) => m.state === "cooldown").length, unconfigured: mesh.filter((m) => m.state === "unconfigured").length, providers: mesh.map((m) => ({ id: m.id, state: m.state, successes: m.successes, failures: m.failures })) }, mcp: hubSummary(), process: { uptimeSec: Math.round(process.uptime()), memMb: Math.round(process.memoryUsage().rss / 1e6), node: process.version } }); if (isNew) res.cookies.set(uidCookie(uid)); return res;
}
