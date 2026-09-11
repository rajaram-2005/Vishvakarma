import { NextResponse } from "next/server";
import { statSync, mkdirSync } from "node:fs";
import path from "node:path";
import { VERSION } from "@/aetheris/lib/version";

export const dynamic = "force-dynamic";

/** Liveness/readiness probe for Docker, Kubernetes and uptime monitors. No auth, no secrets. */
export async function GET() {
  const dir = process.env.AETHERIS_DATA_DIR ?? path.join(process.cwd(), "data");
  let dataWritable = false;
  try { mkdirSync(dir, { recursive: true }); dataWritable = statSync(dir).isDirectory(); } catch { dataWritable = false; }
  const body = { ok: dataWritable, service: "aetheris-one", version: VERSION, runtime: process.env.AETHERIS_DESKTOP === "1" ? "desktop" : "server", node: process.version, uptime_s: Math.round(process.uptime()), data_dir: dataWritable ? "writable" : "unavailable", time: new Date().toISOString() };
  return NextResponse.json(body, { status: dataWritable ? 200 : 503, headers: { "cache-control": "no-store" } });
}
