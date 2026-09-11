import { NextResponse } from "next/server";
import { mediaMeshStatus } from "@/aetheris/lib/media/router";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ providers: mediaMeshStatus() });
}
