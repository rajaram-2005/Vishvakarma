/**
 * Single place that knows which Aetheris release this process is running.
 *
 * `VERSION` at the repository root is the source of truth; `tools/bump-version.mjs` writes it into
 * `package.json` on every monthly release, so importing the package version keeps the runtime value
 * and the published metadata in sync by construction (and the release test suite fails if they
 * drift apart).
 */
import pkg from "../../package.json";

export const VERSION: string = (pkg as { version?: string }).version ?? "0.0.0";

/** Release cadence advertised by `GET /api/version`. */
export const CADENCE = "monthly" as const;
export const SCHEME = "calver" as const;
