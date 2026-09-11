/**
 * Workspaces (Phase 16/21) — a named scope that groups knowledge facts, memory, jobs, devices and
 * automations. Persisted in the JSON store; the fabric/memory/jobs already accept a `workspace`
 * string, so a workspace is the durable record + counts over those scopes.
 *
 * Sharing: the owner can add other users as `editor` or `viewer` members. Membership is stored on
 * the workspace record itself (no invites table, no email delivery) and every mutation is audited
 * as a `workspace` event. A member reads the shared scope through `readableScopes()`, which is what
 * `/api/knowledge` uses — so sharing is enforced by one function rather than sprinkled checks.
 *
 * Status: IMPLEMENTED.
 */
import { randomUUID } from "node:crypto";
import { store } from "@/aetheris/lib/store";
import { listFacts } from "@/aetheris/core/knowledge/fabric";
import { listJobs } from "@/aetheris/core/agents/runtime";
import { record } from "@/aetheris/core/observability/events";

const COL = "workspaces";
export const DEFAULT_WORKSPACE = "default";
export const MAX_MEMBERS = 25;

export type WorkspaceRole = "owner" | "editor" | "viewer";
export interface WorkspaceMember { uid: string; role: Exclude<WorkspaceRole, "owner">; addedAt: number }
export interface Workspace {
  id: string;
  uid: string;
  name: string;
  description?: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
  archived?: boolean;
  members?: WorkspaceMember[];
}

/** A scope a caller is allowed to read: whose data, under which workspace key. */
export interface ReadableScope { uid: string; workspace: string | undefined; workspaceId: string; role: WorkspaceRole }

/** Normalise a stored record. Returns undefined for a missing id — never throws on it. */
const norm = (raw: Workspace | undefined): Workspace | undefined => {
  if (!raw || typeof raw !== "object") return undefined;
  return { ...raw, members: (raw.members ?? []).filter((m) => m && typeof m.uid === "string" && m.uid !== raw.uid) };
};

export async function listWorkspaces(uid: string): Promise<Workspace[]> {
  const all = Object.values(await store.all<Workspace>(COL)).filter((w) => w.uid === uid).map((w) => norm(w)!);
  if (!all.some((w) => w.id === `${uid}:${DEFAULT_WORKSPACE}`)) all.unshift(await ensureDefault(uid));
  return all.sort((a, b) => a.createdAt - b.createdAt);
}

/** Workspaces other people own that this uid is a member of. */
export async function listSharedWorkspaces(uid: string): Promise<Workspace[]> {
  return Object.values(await store.all<Workspace>(COL))
    .map((w) => norm(w)!)
    .filter((w) => w.uid !== uid && (w.members ?? []).some((m) => m.uid === uid))
    .sort((a, b) => a.createdAt - b.createdAt);
}

/**
 * Every scope this uid may read: its own workspaces, plus the shared ones it belongs to.
 * The knowledge/memory routes call this instead of checking membership themselves.
 */
export async function readableScopes(uid: string): Promise<ReadableScope[]> {
  const [mine, shared] = await Promise.all([listWorkspaces(uid), listSharedWorkspaces(uid)]);
  return [
    ...mine.map((w) => ({ uid, workspace: scopeOf(w), workspaceId: w.id, role: "owner" as const })),
    ...shared.map((w) => ({
      uid: w.uid,
      workspace: scopeOf(w),
      workspaceId: w.id,
      role: (w.members ?? []).find((m) => m.uid === uid)?.role ?? ("viewer" as const),
    })),
  ];
}

/** Resolve a workspace for a caller: owned, or shared. Returns the caller's role. */
export async function accessWorkspace(uid: string, id: string): Promise<{ workspace: Workspace; role: WorkspaceRole } | null> {
  const w = norm(await store.get<Workspace>(COL, id));
  if (!w) return null;
  if (w.uid === uid) return { workspace: w, role: "owner" };
  const member = (w.members ?? []).find((m) => m.uid === uid);
  return member ? { workspace: w, role: member.role } : null;
}

export async function ensureDefault(uid: string): Promise<Workspace> {
  const id = `${uid}:${DEFAULT_WORKSPACE}`;
  return store.update<Workspace>(COL, id, (cur) => cur ?? { id, uid, name: "Default", tags: [], createdAt: Date.now(), updatedAt: Date.now() });
}

export async function createWorkspace(uid: string, input: { name: string; description?: string; tags?: string[] }): Promise<Workspace> {
  const name = input.name.trim().slice(0, 80); if (!name) throw new Error("name required");
  if ((await listWorkspaces(uid)).length >= 50) throw new Error("workspace limit (50) reached");
  const w: Workspace = { id: `${uid}:${randomUUID().slice(0, 8)}`, uid, name, description: input.description?.slice(0, 500), tags: (input.tags ?? []).slice(0, 10), createdAt: Date.now(), updatedAt: Date.now(), members: [] };
  await store.set(COL, w.id, w); return w;
}

export async function getWorkspace(uid: string, id: string) {
  const w = norm(await store.get<Workspace>(COL, id));
  return w && w.uid === uid ? w : undefined;
}

export async function updateWorkspace(uid: string, id: string, patch: Partial<Pick<Workspace, "name" | "description" | "tags" | "archived">>) {
  const w = await getWorkspace(uid, id); if (!w) return undefined;
  return store.update<Workspace>(COL, id, (cur) => ({ ...(cur as Workspace), ...patch, name: (patch.name ?? cur!.name).trim().slice(0, 80) || cur!.name, updatedAt: Date.now() }));
}

export async function deleteWorkspace(uid: string, id: string) {
  const w = await getWorkspace(uid, id); if (!w || id.endsWith(`:${DEFAULT_WORKSPACE}`)) return false;
  await store.remove(COL, id);
  record({ type: "permission", uid, capability: "workspace:delete", ok: true, detail: `${w.name} (${(w.members ?? []).length} member(s))` });
  return true;
}

// ---- sharing -----------------------------------------------------------------------------------

const asRole = (raw: unknown): Exclude<WorkspaceRole, "owner"> | null => (raw === "editor" || raw === "viewer" ? raw : null);

/** Members of a workspace, with the owner always first. `null` when the caller has no access. */
export async function listMembers(uid: string, id: string): Promise<{ owner: string; members: WorkspaceMember[] } | null> {
  const access = await accessWorkspace(uid, id);
  if (!access) return null;
  return { owner: access.workspace.uid, members: access.workspace.members ?? [] };
}

/**
 * Add (or re-role) a member. Only the owner can do this; the default workspace cannot be shared,
 * because its scope is the user's unscoped data.
 */
export async function addMember(uid: string, id: string, input: { member: string; role?: string }): Promise<Workspace> {
  const w = await getWorkspace(uid, id);
  if (!w) throw new Error("workspace not found");
  if (id.endsWith(`:${DEFAULT_WORKSPACE}`)) throw new Error("the default workspace cannot be shared");
  const member = input.member.trim();
  if (!member) throw new Error("member required");
  // User ids are the 32-hex cookie value (src/lib/user.ts). Anything else can never authenticate,
  // so sharing with it would silently grant access to nobody.
  if (!/^[a-f0-9]{32}$/.test(member)) throw new Error("member must be a 32-character user id");
  if (member === uid) throw new Error("you already own this workspace");
  const role = asRole(input.role ?? "viewer") ?? (() => { throw new Error('role must be "editor" or "viewer"'); })();
  const existing = w.members ?? [];
  if (!existing.some((m) => m.uid === member) && existing.length >= MAX_MEMBERS) throw new Error(`member limit (${MAX_MEMBERS}) reached`);
  const members = existing.filter((m) => m.uid !== member).concat([{ uid: member, role, addedAt: Date.now() }]);
  const next = await store.update<Workspace>(COL, id, (cur) => ({ ...(cur as Workspace), members, updatedAt: Date.now() }));
  record({ type: "permission", uid, capability: "workspace:share", ok: true, detail: `${w.name}: +${member} as ${role}` });
  return next;
}

export async function setMemberRole(uid: string, id: string, member: string, role: string): Promise<Workspace> {
  const w = await getWorkspace(uid, id);
  if (!w) throw new Error("workspace not found");
  const r = asRole(role) ?? (() => { throw new Error('role must be "editor" or "viewer"'); })();
  const members = w.members ?? [];
  if (!members.some((m) => m.uid === member)) throw new Error("not a member");
  const next = await store.update<Workspace>(COL, id, (cur) => ({
    ...(cur as Workspace),
    members: members.map((m) => (m.uid === member ? { ...m, role: r } : m)),
    updatedAt: Date.now(),
  }));
  record({ type: "permission", uid, capability: "workspace:share", ok: true, detail: `${w.name}: ${member} → ${r}` });
  return next;
}

/** Remove a member. The owner removes anyone; a member may remove themselves (`uid === member`). */
export async function removeMember(uid: string, id: string, member: string): Promise<Workspace | null> {
  const access = await accessWorkspace(uid, id);
  if (!access) return null;
  const isOwner = access.role === "owner";
  if (!isOwner && uid !== member) return null;
  const members = (access.workspace.members ?? []).filter((m) => m.uid !== member);
  const next = await store.update<Workspace>(COL, id, (cur) => ({ ...(cur as Workspace), members, updatedAt: Date.now() }));
  record({ type: "permission", uid, capability: "workspace:share", ok: true, detail: `${access.workspace.name}: -${member}${isOwner ? "" : " (left)"}` });
  return next;
}

/** Scope key used by fabric/memory/jobs for this workspace (short id after the uid prefix). */
export const scopeOf = (w: Workspace) => w.id.split(":").slice(1).join(":");

/** Counts of what lives inside a workspace — computed, never estimated. */
export async function workspaceStats(uid: string, w: Workspace) {
  const scope = scopeOf(w);
  const [facts, jobs] = await Promise.all([listFacts(uid, scope, 1000), listJobs(uid, 500)]);
  const inScope = jobs.filter((j) => (j as { workspace?: string }).workspace === scope);
  return {
    scope,
    facts: facts.length,
    memories: facts.filter((f) => f.tags.some((t) => t.startsWith("memory:"))).length,
    jobs: inScope.length,
    runningJobs: inScope.filter((j) => j.status === "running").length,
    members: (w.members ?? []).length,
    role: w.uid === uid ? ("owner" as const) : ((w.members ?? []).find((m) => m.uid === uid)?.role ?? ("viewer" as const)),
  };
}
