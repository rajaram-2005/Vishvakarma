/**
 * Request parsing for Incident Command.
 *
 * Separate from `command.ts` (the incident engine) and from `src/app/api/incident/route.ts` (which may
 * only export HTTP methods and route config). The handler stays thin; this module decides what an
 * untrusted body is allowed to do to the plant's incident state.
 */
import { sanitizeIncidentInput, type IncidentInput } from "./command";
import { asRecord, type FieldError, type ParseResult } from "../../security/validate";

/** The actions this surface understands. Anything else is a 422, not a silent fallthrough. */
export const INCIDENT_ACTIONS = ["trigger", "clear"] as const;
export type IncidentAction = (typeof INCIDENT_ACTIONS)[number];

export interface IncidentRequest {
  action: IncidentAction;
  /** Sanitized, typed fields only. Empty means "use the plant defaults". */
  incident: IncidentInput;
  /** Fields that were dropped, with the reason. Surfaced to the caller and to the UI. */
  ignored: string[];
}

export function parseIncidentRequest(raw: unknown): ParseResult<IncidentRequest> {
  const body = asRecord(raw);
  if (!body) return { ok: false, status: 400, errors: [{ field: "body", message: "body must be a JSON object" }] };

  const errors: FieldError[] = [];
  // An absent action means "trigger": that was the previous behaviour, and the incident screen relies on it.
  let action: IncidentAction = "trigger";
  if (body.action !== undefined && body.action !== null) {
    if (typeof body.action !== "string" || !(INCIDENT_ACTIONS as readonly string[]).includes(body.action)) {
      errors.push({ field: "action", message: `must be one of ${INCIDENT_ACTIONS.join(", ")}` });
    } else {
      action = body.action as IncidentAction;
    }
  }

  if (body.incidentData !== undefined && body.incidentData !== null && asRecord(body.incidentData) === null) {
    errors.push({ field: "incidentData", message: "must be a JSON object" });
  }

  if (errors.length) return { ok: false, status: 422, errors };
  if (action === "clear") return { ok: true, value: { action, incident: {}, ignored: [] } };

  const sanitized = sanitizeIncidentInput(body.incidentData ?? {});
  return { ok: true, value: { action, incident: sanitized.incident, ignored: sanitized.ignored } };
}
