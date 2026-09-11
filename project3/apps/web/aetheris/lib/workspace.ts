/**
 * Per-user RAVANA workspace files: local default is the filesystem
 * (`<dataDir>/ravana_workspace/<uid>/`); hosted/Vercel mode uses Vercel Blob:
 *
 *   AETHERIS_WORKSPACE=blob  +  BLOB_READ_WRITE_TOKEN=...  (Marketplace wires it)
 *
 * Both backends enforce the same confinement: `..` escapes and absolute paths are refused with
 * TraversalError (the tools map it to the long-standing "path traversal refused" refusal).
 * Blob keys live under `ravana-workspace/<uid>/`.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { blobDel, blobGet, blobPublicUrl, blobPut, blobToken } from "./blob";

export class TraversalError extends Error {
  constructor(rel: string) {
    super(`path traversal refused: ${rel}`);
    this.name = "TraversalError";
  }
}

/** Hosted workspace backend (Vercel Blob). Resolved per call so tests can switch modes by setting env. */
export const isBlobWorkspace = () => process.env.AETHERIS_WORKSPACE === "blob";

const DATA_DIR = () => process.env.AETHERIS_DATA_DIR ?? path.join(process.cwd(), "data");
export const workspaceRoot = (uid: string) => path.join(DATA_DIR(), "ravana_workspace", uid);

/** Normalize a user-supplied relative path to posix segments, or throw TraversalError on escape. */
export function normalizeRel(rel: string): string[] {
  const parts = rel.replace(/\\/g, "/").split("/").filter((p) => p && p !== ".");
  if (!rel.trim() || parts.length === 0 || parts.some((p) => p === "..") || path.posix.isAbsolute(rel.replace(/\\/g, "/"))) {
    throw new TraversalError(rel);
  }
  return parts;
}

const blobKey = (uid: string, parts: string[]) => `ravana-workspace/${uid}/${parts.join("/")}`;

export async function workspaceRead(uid: string, rel: string): Promise<string> {
  const parts = normalizeRel(rel);
  if (!isBlobWorkspace()) {
    return fs.readFile(path.join(workspaceRoot(uid), ...parts), "utf8");
  }
  return blobGet(blobKey(uid, parts));
}

export async function workspaceWrite(uid: string, rel: string, content: string): Promise<void> {
  const parts = normalizeRel(rel);
  if (!isBlobWorkspace()) {
    const abs = path.join(workspaceRoot(uid), ...parts);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, content, "utf8");
    return;
  }
  await blobPut(blobKey(uid, parts), content);
}

export async function workspaceRemove(uid: string, rel: string): Promise<void> {
  const parts = normalizeRel(rel);
  if (!isBlobWorkspace()) {
    await fs.rm(path.join(workspaceRoot(uid), ...parts), { force: true });
    return;
  }
  await blobDel(blobPublicUrl(blobKey(uid, parts)));
}

/** Where the workspace lives and whether it is reachable — reported, never assumed. */
export async function workspaceStatus(uid: string): Promise<{ backend: "files" | "blob"; root: string; reachable: boolean; reason?: string }> {
  if (!isBlobWorkspace()) return { backend: "files", root: workspaceRoot(uid), reachable: true };
  try {
    blobToken();
    return { backend: "blob", root: `blob:ravana-workspace/${uid}/`, reachable: true };
  } catch (e) {
    return { backend: "blob", root: `blob:ravana-workspace/${uid}/`, reachable: false, reason: (e as Error).message };
  }
}
