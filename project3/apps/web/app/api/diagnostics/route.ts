/**
 * Diagnostics API.
 *   POST /api/diagnostics
 *     { op: "spectrum", signal, sampleRateHz, window? }      -> raw FFT result
 *     { op: "diagnose", signal, sampleRateHz, rotorRpm, ... } -> diagnostic verdict
 *     { op: "twin",     twinId?, rotorRpm?, channel?, anomalyScore?, injectBearingFault? }
 *                                                         -> run the digital-twin
 *                                                            simulator + FFT in one call
 *     { op: "history",  twinId, sinceMs?, limit? }         -> past diagnostics for a twin
 *     { op: "trend",    twinId, windowMs?, maxEntries? }   -> SMA + slope alarm
 *   GET  /api/diagnostics    -> status (what the engine supports)
 */
import { NextResponse } from "next/server";
import { getUserId, uidCookie } from "@/aetheris/lib/user";
import { fftSpectrum, type Window } from "@/aetheris/core/diagnostics/fft";
import { diagnose } from "@/aetheris/core/diagnostics/engine";
import { diagnoseTwin } from "@/aetheris/core/diagnostics/integration";
import { getHistory, getTrend, recordDiagnostic, prune } from "@/aetheris/core/diagnostics/history";
import { getTwin } from "@/aetheris/core/twins/twins";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { uid, isNew } = await getUserId();
  const res = NextResponse.json({
    status: {
      available: true,
      supports: [
        "fft",
        "windowed-fft (rect|hann|hamming|blackman)",
        "spectral-peaks",
        "bearing-signature-matching",
        "envelope-demodulation (Hilbert transform)",
        "twin-integrated-diagnosis",
        "diagnostic-history",
        "trend-tracking (SMA + linear-regression slope alarm)",
      ],
      doesNotSupport: [
        "2D FFT",
        "streaming/overlap-add (use the wind turbine simulator with sliding windows)",
        "iir/fir filter design",
      ],
      notes: "Zero-deps, in-memory. Max signal length 65536. See docs/WINDTURBINE.md and tests/diagnostics.test.ts.",
    },
  });
  if (isNew) res.cookies.set(uidCookie(uid));
  return res;
}

export async function POST(req: Request) {
  const { uid, isNew } = await getUserId();
  const b = (await req.json().catch(() => ({}))) as
    | { op: "spectrum"; signal: number[]; sampleRateHz: number; window?: Window }
    | { op: "diagnose"; signal: number[]; sampleRateHz: number; rotorRpm: number; window?: Window; topPeaks?: number; toleranceHz?: number; record?: boolean; labels?: string[] }
    | { op: "twin"; twinId?: string; rotorRpm?: number; channel?: string; anomalyScore?: number; torqueNm?: number; injectBearingFault?: boolean; sampleRateHz?: number; durationSec?: number; uid?: string; record?: boolean; labels?: string[] }
    | { op: "history"; twinId: string; sinceMs?: number; limit?: number }
    | { op: "trend"; twinId: string; windowMs?: number; maxEntries?: number; riseThreshold?: number; fallThreshold?: number }
    | { op: "prune"; twinId: string; cap: number };
  if (!b || !b.op) return NextResponse.json({ error: "op is required" }, { status: 400 });

  try {
    if (b.op === "spectrum") {
      const r = fftSpectrum({ signal: b.signal, sampleRateHz: b.sampleRateHz, window: b.window });
      const res = NextResponse.json({ spectrum: r });
      if (isNew) res.cookies.set(uidCookie(uid));
      return res;
    }
    if (b.op === "diagnose") {
      const r = diagnose(b.signal, { sampleRateHz: b.sampleRateHz, rotorRpm: b.rotorRpm, window: b.window, topPeaks: b.topPeaks, toleranceHz: b.toleranceHz, uid });
      let entry = null;
      if (b.record) entry = await recordDiagnostic("ad-hoc", r, { uid, labels: b.labels });
      const res = NextResponse.json({ diagnostic: r, historyEntry: entry });
      if (isNew) res.cookies.set(uidCookie(uid));
      return res;
    }
    if (b.op === "twin") {
      const twin = b.twinId ? await getTwin(b.twinId) : null;
      if (b.twinId && (!twin || twin.uid !== uid)) return NextResponse.json({ error: "twin not found" }, { status: 404 });
      if (!twin) return NextResponse.json({ error: "twinId is required for op=twin (or first create one via /api/windturbine op:canon)" }, { status: 400 });
      const r = diagnoseTwin(twin, {
        rotorRpm: b.rotorRpm,
        sampleRateHz: b.sampleRateHz,
        durationSec: b.durationSec,
        channel: (b.channel ?? "vib_bearing_mms") as never,
        anomalyScore: b.anomalyScore,
        torqueNm: b.torqueNm,
        injectBearingFault: b.injectBearingFault,
        uid,
      });
      let entry = null;
      if (b.record !== false) entry = await recordDiagnostic(twin.id, r, { uid, labels: b.labels });
      const res = NextResponse.json({ diagnostic: r, historyEntry: entry });
      if (isNew) res.cookies.set(uidCookie(uid));
      return res;
    }
    if (b.op === "history") {
      if (!b.twinId) return NextResponse.json({ error: "twinId is required" }, { status: 400 });
      // Sanity: refuse to leak other users' twin histories. The twin's uid must match.
      const twin = await getTwin(b.twinId);
      if (!twin || twin.uid !== uid) return NextResponse.json({ error: "twin not found" }, { status: 404 });
      const hist = await getHistory(b.twinId, { sinceMs: b.sinceMs, limit: b.limit });
      const res = NextResponse.json({ history: hist });
      if (isNew) res.cookies.set(uidCookie(uid));
      return res;
    }
    if (b.op === "trend") {
      if (!b.twinId) return NextResponse.json({ error: "twinId is required" }, { status: 400 });
      const twin = await getTwin(b.twinId);
      if (!twin || twin.uid !== uid) return NextResponse.json({ error: "twin not found" }, { status: 404 });
      const r = await getTrend(b.twinId, { windowMs: b.windowMs, maxEntries: b.maxEntries, riseThreshold: b.riseThreshold, fallThreshold: b.fallThreshold });
      const res = NextResponse.json({ trend: r });
      if (isNew) res.cookies.set(uidCookie(uid));
      return res;
    }
    if (b.op === "prune") {
      if (!b.twinId) return NextResponse.json({ error: "twinId is required" }, { status: 400 });
      const twin = await getTwin(b.twinId);
      if (!twin || twin.uid !== uid) return NextResponse.json({ error: "twin not found" }, { status: 404 });
      const removed = await prune(b.twinId, b.cap);
      const res = NextResponse.json({ removed });
      if (isNew) res.cookies.set(uidCookie(uid));
      return res;
    }
    return NextResponse.json({ error: "op must be spectrum|diagnose|twin|history|trend|prune" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
