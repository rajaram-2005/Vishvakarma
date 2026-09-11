import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/aetheris/lib/github/auth";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
