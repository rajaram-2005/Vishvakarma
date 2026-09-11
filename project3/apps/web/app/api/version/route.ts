import { VERSION } from "@/aetheris/lib/version";

export const dynamic = "force-dynamic";

/**
 * `GET /api/version` — what release this instance is running, and how it is packaged.
 *
 * The desktop app calls this to (a) show the version of the server it is talking to in remote mode
 * and (b) confirm that a candidate URL really is an Aetheris instance before the desktop app
 * saves it on its connection screen. Unauthenticated, no secrets.
 */
export async function GET() {
  return Response.json(
    {
      version: VERSION,
      /** CalVer `YYYY.M.P`; a new release is published at the start of every month. */
      scheme: "calver",
      cadence: "monthly",
      service: "aetheris-one",
      /** `desktop` when this process is the server embedded in the desktop app. */
      runtime: process.env.AETHERIS_DESKTOP === "1" ? "desktop" : "server",
      desktop_version: process.env.AETHERIS_DESKTOP_VERSION ?? null,
      node: process.version,
      channel: process.env.AETHERIS_UPDATE_CHANNEL ?? "stable",
    },
    { headers: { "cache-control": "no-store" } },
  );
}
