/**
 * Next.js 15 App Router page-prop helpers.
 *
 * `searchParams` is always a Promise. Values are `string | string[] | undefined`.
 * Pages must not accept a plain Record, and must not union Record with Promise —
 * that fails the generated PageProps check during `next build`.
 */

export type AppSearchParams<
  T extends Record<string, string | string[] | undefined> = Record<string, string | string[] | undefined>,
> = Promise<T>;

/** First non-empty string from a Next.js 15 searchParams value. */
export function firstSearchParam(value: string | string[] | undefined): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === "string") {
        const trimmed = item.trim();
        if (trimmed.length > 0) return trimmed;
      }
    }
  }
  return undefined;
}
