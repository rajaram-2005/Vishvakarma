import { NextResponse } from "next/server";
import { bootCapabilities } from "@/aetheris/core/capabilities/sources";
import { listPlugins } from "@/aetheris/core/plugins/sdk";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";

/** GET → installed plugins and their capability ids. */
export async function GET() { bootCapabilities(); return NextResponse.json({ plugins: listPlugins() }); }
