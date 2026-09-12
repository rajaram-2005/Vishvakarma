/**
 * Minimal Vercel Blob client over `fetch` — no new dependencies (the repo pins a lockfile, so the
 * @vercel/blob SDK is deliberately not added; the surface we need — put/get/delete — is three
 * REST calls).
 *
 * Protocol (Vercel Blob REST API; the one live-validated call is `PUT /<pathname>`):
 *   PUT  https://blob.vercel-storage.com/<pathname>   upload (x-add-random-suffix: 0 keeps our key)
 *   GET  https://<storeId>.public.blob.vercel-storage.com/<pathname>   public read
 *   POST https://blob.vercel-storage.com/delete  { urls }   delete
 * The store id is embedded in the token (`vercel_blob_rw_<storeId>_<secret>`), which the Vercel
 * Marketplace wires as BLOB_READ_WRITE_TOKEN automatically. Before first hosted use, validate with:
 *
 *   BLOB_READ_WRITE_TOKEN=... node scripts/blob-roundtrip.mjs
 *
 * which round-trips a scratch file and prints the exact failure if the protocol has drifted.
 */

const API_URL = "https://blob.vercel-storage.com";
/** Pinned REST version; if Blob ever rejects it, the error names the expected version (one-line fix). */
const API_VERSION = "7";

export type BlobFetch = (url: string, init?: RequestInit) => Promise<Response>;
let testFetch: BlobFetch | null = null;
/** Tests only: stub the transport (the suite must not touch the network). */
export function __setBlobFetchForTests(f: BlobFetch | null) {
  testFetch = f;
}
const http = (url: string, init?: RequestInit): Promise<Response> =>
  (testFetch ?? fetch)(url, init);

export function blobToken(): string {
  const t = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (!t) throw new Error("Blob backend needs BLOB_READ_WRITE_TOKEN (on Vercel: add a Blob store from the Marketplace so the env var is wired automatically).");
  return t;
}

/** `vercel_blob_rw_<storeId>_<secret>` → the public hostname serving the store. */
export function blobPublicUrl(pathname: string, token = blobToken()): string {
  const m = /^vercel_blob_rw_([A-Za-z0-9]+)_/.exec(token);
  if (!m) throw new Error("BLOB_READ_WRITE_TOKEN has an unexpected shape (expected vercel_blob_rw_<storeId>_…).");
  return `https://${m[1]}.public.blob.vercel-storage.com/${pathname.replace(/^\/+/, "")}`;
}

async function throwIfBad(res: Response, what: string): Promise<void> {
  if (res.ok) return;
  const body = (await res.text().catch(() => "")).slice(0, 300);
  throw new Error(`blob ${what} failed (${res.status}${body ? `: ${body}` : ""})`);
}

/** Upload (or overwrite — random suffix disabled so keys stay deterministic). Returns the public URL. */
export async function blobPut(pathname: string, body: string, contentType = "text/plain; charset=utf-8"): Promise<string> {
  const token = blobToken();
  const res = await http(`${API_URL}/${pathname.replace(/^\/+/, "")}`, {
    method: "PUT",
    headers: {
      authorization: `Bearer ${token}`,
      "x-api-version": API_VERSION,
      "x-add-random-suffix": "0",
      "x-content-type": contentType,
      "x-cache-control-max-age": "0",
    },
    body,
    signal: AbortSignal.timeout(30_000),
  });
  await throwIfBad(res, "upload");
  return blobPublicUrl(pathname, token);
}

/** Read a blob back as text. Throws a not-found Error on 404 so callers can treat it like ENOENT. */
export async function blobGet(pathname: string): Promise<string> {
  const token = blobToken();
  const res = await http(blobPublicUrl(pathname, token), {
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(30_000),
  });
  if (res.status === 404) throw new Error(`workspace file not found: ${pathname}`);
  await throwIfBad(res, "download");
  return res.text();
}

/** Delete blobs by public URL (best-effort true when the store confirms). */
export async function blobDel(url: string): Promise<void> {
  const token = blobToken();
  const res = await http(`${API_URL}/delete`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "x-api-version": API_VERSION, "content-type": "application/json" },
    body: JSON.stringify({ urls: [url] }),
    signal: AbortSignal.timeout(30_000),
  });
  await throwIfBad(res, "delete");
}
