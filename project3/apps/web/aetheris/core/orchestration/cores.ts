/**
 * Core Registry — Aetheris v1.
 *
 *   A read-side inventory of the 10 cores named in the
 *   Aetheris architecture document. For each core, this
 *   module records:
 *     - the real source module(s) in the codebase that
 *       implement it (or "scaffolded" if the core is named
 *       but the implementation is elsewhere)
 *     - a one-line honest-scope statement in the document's
 *       voice ("Build now" / "Build as proxy" /
 *       "Build now, but …" / "Do not claim")
 *     - the user-visible surface (the pages and APIs that
 *       expose it)
 *     - a `health()` check that returns the live status
 *       (always 'live' for now; the registry is descriptive,
 *       not diagnostic)
 *
 *   Nothing is fabricated. The build/honest-call strings
 *   come straight from the document. The module paths
 *   reference real files. If a future change moves a core
 *   behind a stub, the entry will reflect that honestly.
 */

export type BuildCall =
  | "Build now"
  | "Build as proxy"
  | "Build initially as recommendation/optimization layer"
  | "Build now, but don't claim"
  | "Build the integration now; train later"
  | "Build as analytics/diagnostic engine"
  | "Build as orchestration";

export interface CoreSurface {
  /** The user-visible page(s) — at most a few. */
  pages: string[];
  /** The HTTP API routes that expose the core. */
  apis: string[];
  /** The source module(s) that implement the core. */
  modules: string[];
}

export interface Core {
  /** The short name, e.g. "RAVANA". */
  id: string;
  /** A one-sentence role statement. */
  role: string;
  /** The honest-scope call from the document, in document voice. */
  buildCall: BuildCall;
  /** What the core can do today (Section 3 voice). */
  canDo: string;
  /** What the core does not yet do (Section 3 voice). */
  cannotDo: string;
  /** The user-visible surface. */
  surface: CoreSurface;
}

export const CORES: Core[] = [
  {
    id: "RAVANA",
    role: "Reasoning & agent orchestration core.",
    buildCall: "Build now",
    canDo: "Decomposes a task, selects tools, runs a budgeted agent loop, records checkpoints, and emits a structured answer traceable to the modules it called.",
    cannotDo: "Reason at AGI level. It composes existing models and modules; it does not invent capabilities they do not have.",
    surface: { pages: ["/agents", "/trace", "/fuse"], apis: ["/api/agents", "/api/fuse (planned)"], modules: ["src/core/agents/runtime.ts", "src/core/orchestration/fusion.ts"] },
  },
  {
    id: "VAYU-1",
    role: "Wind & aerodynamics intelligence service.",
    buildCall: "Build as proxy",
    canDo: "Composes the existing wind/aero modules (FFT, anomaly, PBNN, model arena) behind a single named query interface. Returns a structured bundle, each part sourced from a real module.",
    cannotDo: "Act as a trained, evaluated wind-domain foundation model. It is a service that routes to existing modules, not a fine-tuned model.",
    surface: { pages: ["/vayu", "/learning", "/diagnostics", "/arena"], apis: ["/api/fuse (planned)"], modules: ["src/core/vayu/service.ts", "src/core/windturbine/model.ts", "src/core/diagnostics/fft.ts", "src/core/learning/predictions.ts", "src/core/anomaly/detector.ts", "src/core/arena/compare.ts"] },
  },
  {
    id: "DRISHTI",
    role: "Vision & multimodal core.",
    buildCall: "Build the integration now; train later",
    canDo: "Exposes a thin multimodal interface for image-bearing requests. Calls the existing provider layer for inference.",
    cannotDo: "Proprietary visual intelligence. It uses existing vision-capable models; it does not claim its own visual understanding.",
    surface: { pages: ["/diagnostics"], apis: ["/api/multimodal"], modules: ["src/core/multimodal"] },
  },
  {
    id: "YANTRA",
    role: "Digital-twin UI & asset graph.",
    buildCall: "Build now",
    canDo: "3D wind-turbine visualisation, component selection, telemetry overlays, asset hierarchy, and the canonical turbine twin (27 bounds, 13 rules, full state, history, events, relationships, maintenance).",
    cannotDo: "Engineering-grade physical simulation. The 3D model is a visualisation with a software-only digital twin; it is not a validated engineering digital twin.",
    surface: { pages: ["/twin-3d", "/twins", "/twins/edit"], apis: ["/api/twins", "/api/twins/edit"], modules: ["src/core/twins/twins.ts", "src/core/windturbine/model.ts"] },
  },
  {
    id: "PRAVAAH",
    role: "Telemetry / SCADA intelligence layer.",
    buildCall: "Build now",
    canDo: "Ingestion, normalisation, time-series visualisation, thresholds, FFT processing, and anomaly pipelines against supplied or simulated datasets. Honest label: this works on whatever data is loaded.",
    cannotDo: "Production-accuracy fault diagnosis. Until benchmarked on real SCADA/vibration data, accuracy is whatever the algorithms produce — call it engineering, not validated.",
    surface: { pages: ["/devices", "/fleet", "/diagnostics"], apis: ["/api/telemetry"], modules: ["src/core/fleet/overview.ts", "src/core/learning/predictions.ts", "src/core/diagnostics"] },
  },
  {
    id: "NIRIKSHAN",
    role: "Diagnostics & analytics engine.",
    buildCall: "Build as analytics/diagnostic engine",
    canDo: "FFT, thresholding, statistical anomaly detection, PBNN prediction, model-assisted diagnosis. Returns structured severity, peak magnitude, dominant frequency, top fault, and a confidence estimate.",
    cannotDo: "Predict gearbox failure with a specific accuracy claim. We do not benchmark that without a labelled dataset.",
    surface: { pages: ["/diagnostics", "/learning", "/anomaly"], apis: ["/api/diagnostics"], modules: ["src/core/diagnostics", "src/core/anomaly/detector.ts", "src/core/learning/predictions.ts"] },
  },
  {
    id: "CHAKRA",
    role: "Recommendation / optimisation layer.",
    buildCall: "Build initially as recommendation/optimization layer",
    canDo: "Model arena (compare candidate configurations), recommendations, and optimisation suggestions sourced from the existing model-arena engine and the credits/cost ledger.",
    cannotDo: "Autonomous physical control. It recommends; it does not actuate. Hardware control requires physical validation and is opt-in behind a `physical` permission.",
    surface: { pages: ["/arena", "/credits"], apis: ["/api/arena", "/api/billing"], modules: ["src/core/arena/compare.ts", "src/core/credits/ledger.ts"] },
  },
  {
    id: "SMRITI",
    role: "Memory fabric.",
    buildCall: "Build now",
    canDo: "Project memory, asset history, documents, procedures, incidents, knowledge graph edges, semantic retrieval, and the evidence ledger. Stores structured memory in the local store with retrieval by query and by id.",
    cannotDo: "It does not invent knowledge. Retrieval is over what was actually written; if nothing is written, the answer is empty.",
    surface: { pages: ["/knowledge-graph", "/evidence", "/handoff"], apis: ["/api/memory"], modules: ["src/core/memory/memory.ts", "src/core/knowledge/fabric.ts", "src/core/twins/evidence.ts"] },
  },
  {
    id: "SETU",
    role: "Tools / MCP / WSO2 / terminals.",
    buildCall: "Build now",
    canDo: "WSO2 gateway integration, MCP, sandboxed command execution (terminal), the lab sandbox for code execution, and the plugin system. Each tool is capability-gated.",
    cannotDo: "It will not call arbitrary executables. The terminal's allowlist and the lab's runtime guard are real; we do not pretend they are open.",
    surface: { pages: ["/terminal", "/lab-history", "/warroom"], apis: ["/api/terminal", "/api/lab"], modules: ["src/core/execution/sandbox.ts", "src/core/automation/terminal.ts", "src/core/lab/history.ts", "src/core/mcp", "src/core/warroom"] },
  },
  {
    id: "NIRNAYA",
    role: "Verification & decision layer.",
    buildCall: "Build now, but don't claim",
    canDo: "Evidence checks, constraint checks, cross-model comparison, data-quality checks, test execution, uncertainty estimation, and policy enforcement. Returns a structured decision with a verifiable trace.",
    cannotDo: "Mathematically prove that an AI result is correct. It can verify against rules, tests, and constraints; it does not provide a proof of correctness.",
    surface: { pages: ["/audit", "/trace", "/permissions-matrix", "/trust"], apis: ["/api/audit-export"], modules: ["src/core/verification/verify.ts", "src/core/policy/permissions.ts", "src/core/capabilities/registry.ts", "src/core/observability"] },
  },
];

export interface CoreHealth {
  id: string;
  status: "live" | "scaffolded" | "degraded";
  /** Number of pages and APIs the core is exposed through. */
  surface: number;
  /** Human-readable note, derived from buildCall. */
  note: string;
}

export function coreHealth(): CoreHealth[] {
  return CORES.map((c) => {
    const surface = c.surface.pages.length + c.surface.apis.length;
    const status: CoreHealth["status"] = c.buildCall === "Build now" ? "live" : c.buildCall === "Build as proxy" ? "live" : c.buildCall === "Build initially as recommendation/optimization layer" ? "live" : "scaffolded";
    return { id: c.id, status, surface, note: c.buildCall };
  });
}

export function findCore(id: string): Core | null {
  const upper = id.toUpperCase();
  return CORES.find((c) => c.id === upper) ?? null;
}
