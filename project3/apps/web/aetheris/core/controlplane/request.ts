/**
 * Request parsing for the 12-Phase Gated Intelligence Pipeline.
 *
 * Lives outside `src/app/api/control-plane/route.ts` for two reasons. The practical one: a Next.js
 * route module may only export HTTP methods and route config, so exporting a helper from it fails the
 * build's entry validation. The architectural one: the handler should stay thin, and this is the layer
 * that decides what an untrusted body is allowed to ask the pipeline for.
 */
import {
  DEFAULT_MAX_LOOPBACKS,
  INJECTED_FAILURES,
  isInjectedFailure,
  MAX_LOOPBACKS_LIMIT,
  type InjectedFailure,
} from "./types";
import { asInteger, asRecord, asString, MAX_TEXT, type FieldError, type ParseResult } from "../security/validate";

/** The objective a run uses when the client supplies none — the same task the /control-plane runner pre-fills. */
export const DEFAULT_OBJECTIVE = "Analyze WTG-04 gearbox bearing vibration telemetry";

export interface ControlPlaneRequest {
  request: string;
  maxLoopbacks: number;
  injectedFailure: InjectedFailure;
}

/**
 * Validate an untrusted POST body into a pipeline run request.
 *
 * `maxLoopbacks` is a resource limit rather than a preference: `task.loopbackCount <
 * task.maxLoopbacksAllowed` is the only thing that stops the Phase 7 → Phase 3 recovery loop, so an
 * out-of-range value is rejected here (422) instead of being silently clamped. The supervisor clamps as
 * well — validation tells the caller what it got wrong, the clamp guarantees the ceiling holds for
 * every caller including a programmatic one that never went through this parser.
 */
export function parseControlPlaneRequest(raw: unknown): ParseResult<ControlPlaneRequest> {
  const body = asRecord(raw);
  if (!body) return { ok: false, status: 400, errors: [{ field: "body", message: "body must be a JSON object" }] };

  const errors: FieldError[] = [];

  let request = DEFAULT_OBJECTIVE;
  if (body.request !== undefined && body.request !== null && body.request !== "") {
    const parsed = asString(body.request, MAX_TEXT);
    if (parsed === null) errors.push({ field: "request", message: `must be a string of at most ${MAX_TEXT} characters` });
    else request = parsed;
  }

  let maxLoopbacks = DEFAULT_MAX_LOOPBACKS;
  if (body.maxLoopbacks !== undefined && body.maxLoopbacks !== null) {
    const parsed = asInteger(body.maxLoopbacks, { min: 0, max: MAX_LOOPBACKS_LIMIT });
    if (parsed === null) errors.push({ field: "maxLoopbacks", message: `must be an integer between 0 and ${MAX_LOOPBACKS_LIMIT}` });
    else maxLoopbacks = parsed;
  }

  let injectedFailure: InjectedFailure = "none";
  if (body.injectedFailure !== undefined && body.injectedFailure !== null) {
    if (!isInjectedFailure(body.injectedFailure)) {
      errors.push({ field: "injectedFailure", message: `must be one of ${INJECTED_FAILURES.join(", ")}` });
    } else {
      injectedFailure = body.injectedFailure;
    }
  }

  if (errors.length) return { ok: false, status: 422, errors };
  return { ok: true, value: { request, maxLoopbacks, injectedFailure } };
}
