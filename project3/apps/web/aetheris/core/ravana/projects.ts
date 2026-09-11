/**
 * RAVANA · Projects (spec §20 `projects` table). JSON store behind StorageProvider; the swap
 * point for Postgres/SQLite keeps this module untouched.
 */
import { randomBytes } from "node:crypto";
import { store } from "@/aetheris/lib/store";
import { listTasks } from "./engine";
import type { RavanaProject } from "./types";

const COL = "ravana_projects";

export async function createProject(uid: string, input: { name: string; description?: string }): Promise<RavanaProject> {
  const now = Date.now();
  const p: RavanaProject = { id: `rvp_${randomBytes(4).toString("hex")}`, uid, name: input.name.trim().slice(0, 80), description: input.description?.slice(0, 500), createdAt: now, updatedAt: now };
  await store.set(COL, p.id, p);
  return p;
}

export async function getProject(uid: string, id: string) {
  const p = await store.get<RavanaProject>(COL, id);
  if (!p || p.uid !== uid) return null;
  const tasks = await listTasks(uid, { projectId: id, limit: 1 });
  return { ...p, latestAt: tasks[0]?.createdAt ?? null };
}

export async function listProjects(uid: string) {
  const all = Object.values(await store.all<RavanaProject>(COL)).filter((p) => p.uid === uid);
  const tasks = Object.values(await store.all<{ projectId?: string | null; createdAt: number }>("ravana_tasks")).filter((t) => t.projectId);
  const out: (RavanaProject & { taskCount: number })[] = [];
  for (const p of all) {
    const mine = tasks.filter((t) => t.projectId === p.id);
    out.push({ ...p, taskCount: mine.length });
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function updateProject(uid: string, id: string, input: { name?: string; description?: string }) {
  const cur = await store.get<RavanaProject>(COL, id);
  if (!cur || cur.uid !== uid) return null;
  const next: RavanaProject = {
    ...cur,
    name: input.name?.trim() ? input.name.trim().slice(0, 80) : cur.name,
    description: input.description !== undefined ? input.description.slice(0, 500) : cur.description,
    updatedAt: Date.now(),
  };
  await store.set(COL, id, next);
  return next;
}

export async function deleteProject(uid: string, id: string): Promise<boolean> {
  const p = await store.get<RavanaProject>(COL, id);
  if (!p || p.uid !== uid) return false;
  await store.remove(COL, id);
  return true;
}
