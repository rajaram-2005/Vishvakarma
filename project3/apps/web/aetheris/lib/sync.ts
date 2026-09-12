/** Server-side merge for account cloud sync (pure; unit-tested). */
export interface SyncItem { updatedAt: number; deleted?: boolean; [k: string]: unknown }
export interface SyncBlob { convos: Record<string, SyncItem>; projects: Record<string, unknown>; memory: string[]; settings: Record<string, unknown>; rev: number; at: number }

export function mergeSync(cur: SyncBlob | undefined, inc: Partial<SyncBlob>, now = Date.now()): SyncBlob {
  const base: SyncBlob = cur ?? { convos: {}, projects: {}, memory: [], settings: {}, rev: 0, at: 0 };
  const convos = { ...base.convos };
  for (const [id, c] of Object.entries(inc.convos ?? {})) {
    const prev = convos[id];
    if (!prev || (c.updatedAt ?? 0) >= (prev.updatedAt ?? 0)) convos[id] = c;
  }
  for (const [id, c] of Object.entries(convos)) if (c.deleted && now - c.updatedAt > 30 * 86_400_000) delete convos[id]; // old tombstones
  const memory = Array.from(new Set([...(base.memory ?? []), ...(inc.memory ?? [])])).slice(-80);
  return { convos, projects: { ...base.projects, ...(inc.projects ?? {}) }, memory, settings: { ...base.settings, ...(inc.settings ?? {}) }, rev: base.rev + 1, at: now };
}
