/**
 * Runtime input validation — the one mechanism for turning untrusted JSON into typed values.
 *
 * Every `/api/*` handler receives a body it did not author. Casting that body with
 * `as { foo?: string }` does not validate anything: it only tells the compiler to believe the client,
 * and the belief then travels into domain code that assumes the shape is real. Two concrete
 * consequences existed in this repository before this module was added:
 *
 *   - `POST /api/control-plane` cast `maxLoopbacks` to `number` and handed it to the supervisor, where
 *     it is the *only* bound on the Phase 7 → Phase 3 recovery loop. `{"maxLoopbacks":1e9}` asked one
 *     server worker to re-run five phases a billion times.
 *   - `POST /api/test-lab` spread an arbitrary client object into a `FailureRecord` and stored it under
 *     `record.testId`, so a payload without a string id could collide in the failure database and a
 *     payload with an invented `failureType` or `severity` reached the Test Lab statistics untouched.
 *
 * The primitives here are deliberately small, total and dependency-free: no schema DSL, no runtime
 * dependency, and nothing that imports `next/server`, so they work in a route handler, in the edge
 * middleware, and under `node:test` without a request scope. Each one answers a single question and
 * returns `null` when the answer is no — never throws, never coerces silently.
 *
 * Compose them into a `parse<Thing>Request` function next to the route (or into a `sanitize<Thing>`
 * next to the domain), return the collected `fields` as a 422, and the handler stays thin.
 */

/** One rejected field: where it was, and why. Returned to the client as a 422 body. */
export interface FieldError {
  field: string;
  message: string;
}

/** The outcome of parsing an untrusted body. `ok:false` carries the status the route should return. */
export type ParseResult<T> = { ok: true; value: T } | { ok: false; status: 400 | 422; errors: FieldError[] };

/** Longest string we accept for a free-text field unless the caller says otherwise. */
export const MAX_TEXT = 8_000;
/** Longest string we accept for an identifier-ish field unless the caller says otherwise. */
export const MAX_ID = 256;
/** Most items we accept in a client-supplied array unless the caller says otherwise. */
export const MAX_ARRAY = 64;

/** A plain object, or null. Arrays, null and primitives are all rejected — `typeof [] === "object"`. */
export function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/** A finite string, optionally capped. `undefined`/absent stays null — callers decide if it is required. */
export function asString(value: unknown, max = MAX_TEXT): string | null {
  if (typeof value !== "string") return null;
  if (value.length > max) return null;
  // Reject the control characters that break log lines and terminal output; a newline is allowed
  // because free-text objectives are multi-line.
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) return null;
  return value;
}

/** A finite number within [min, max]. NaN, Infinity and numeric strings are all rejected. */
export function asFiniteNumber(value: unknown, opts: { min?: number; max?: number } = {}): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (opts.min !== undefined && value < opts.min) return null;
  if (opts.max !== undefined && value > opts.max) return null;
  return value;
}

/** An integer within [min, max]. */
export function asInteger(value: unknown, opts: { min?: number; max?: number } = {}): number | null {
  const n = asFiniteNumber(value, opts);
  return n === null || !Number.isInteger(n) ? null : n;
}

/** Membership in a closed vocabulary. The single guard against a client inventing an enum value. */
export function asEnum<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  if (typeof value !== "string") return null;
  return (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

/** An array of strings, capped in length and item size. Anything non-conforming rejects the whole array. */
export function asStringArray(value: unknown, opts: { maxItems?: number; maxItemLength?: number } = {}): string[] | null {
  if (!Array.isArray(value)) return null;
  const maxItems = opts.maxItems ?? MAX_ARRAY;
  if (value.length > maxItems) return null;
  const out: string[] = [];
  for (const item of value) {
    const s = asString(item, opts.maxItemLength ?? MAX_ID);
    if (s === null) return null;
    out.push(s);
  }
  return out;
}

/** Parse a JSON body without throwing. Malformed JSON is a 400, not an unhandled 500. */
export async function readJsonBody(req: { json(): Promise<unknown> }): Promise<{ ok: true; value: unknown } | { ok: false; status: 400; errors: FieldError[] }> {
  try {
    return { ok: true, value: await req.json() };
  } catch {
    return { ok: false, status: 400, errors: [{ field: "body", message: "body is not valid JSON" }] };
  }
}

/** The 422 body every route returns for rejected input: what was wrong, and nothing internal. */
export function validationError(errors: FieldError[]) {
  return { error: "validation failed", fields: errors };
}
