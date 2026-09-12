/**
 * Request parsing for the Test Lab.
 *
 * Kept out of `src/app/api/test-lab/route.ts` because a Next.js route module may only export HTTP
 * methods and route config, and because the handler should stay thin.
 *
 * The behaviour change here is deliberate and worth stating: `action: "record_failure"` used to be
 * paired with `&& body.failure`, so a record request with a missing or malformed failure fell through
 * and silently ran the entire eight-category regression suite instead. Now an explicit `record_failure`
 * either records a validated failure or answers 422 with the offending fields.
 */
import { sanitizeFailureInput, type FailureInput } from "./database";
import { asRecord, type FieldError, type ParseResult } from "../../security/validate";

/** The actions this surface understands. */
export const TEST_LAB_ACTIONS = ["run_suite", "record_failure"] as const;
export type TestLabAction = (typeof TEST_LAB_ACTIONS)[number];

export type TestLabRequest =
  | { action: "run_suite" }
  | { action: "record_failure"; failure: FailureInput };

export function parseTestLabRequest(raw: unknown): ParseResult<TestLabRequest> {
  const body = asRecord(raw);
  if (!body) return { ok: false, status: 400, errors: [{ field: "body", message: "body must be a JSON object" }] };

  const errors: FieldError[] = [];
  // An absent action means "run the suite": the documented default for this endpoint.
  let action: TestLabAction = "run_suite";
  if (body.action !== undefined && body.action !== null) {
    if (typeof body.action !== "string" || !(TEST_LAB_ACTIONS as readonly string[]).includes(body.action)) {
      errors.push({ field: "action", message: `must be one of ${TEST_LAB_ACTIONS.join(", ")}` });
    } else {
      action = body.action as TestLabAction;
    }
  }
  if (errors.length) return { ok: false, status: 422, errors };

  if (action === "run_suite") return { ok: true, value: { action } };

  if (body.failure === undefined || body.failure === null) {
    return { ok: false, status: 422, errors: [{ field: "failure", message: "required for action=record_failure" }] };
  }
  const failure = sanitizeFailureInput(body.failure);
  if (!failure.ok) return { ok: false, status: 422, errors: failure.errors };
  return { ok: true, value: { action: "record_failure", failure: failure.value } };
}
