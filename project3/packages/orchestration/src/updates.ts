// §102 / §103 — Update System with Safe Update (backup → update → health check →
// rollback). Works for platform, plugins, MCP, models and desktop/mobile.

export type UpdatePhase = 'compatibility' | 'backup' | 'update' | 'health' | 'rollback' | 'done';

export interface UpdateResult {
  ok: boolean;
  phases: Array<{ phase: UpdatePhase; ok: boolean; detail: string }>;
}

export interface Updatable {
  id: string;
  version: string;
  /** Returns true if the new version is compatible. */
  checkCompatibility: (next: string) => boolean;
  backup: () => Promise<void>;
  apply: (next: string) => Promise<void>;
  healthCheck: () => Promise<boolean>;
  rollback: () => Promise<void>;
}

/** §103 — Run a safe update. Rolls back automatically on health-check failure. */
export async function safeUpdate(target: Updatable, next: string): Promise<UpdateResult> {
  const phases: UpdateResult['phases'] = [];
  const fail = (phase: UpdatePhase, detail: string): UpdateResult => {
    phases.push({ phase, ok: false, detail });
    return { ok: false, phases };
  };

  if (!target.checkCompatibility(next)) return fail('compatibility', `incompatible with ${next}`);
  try {
    await target.backup();
    phases.push({ phase: 'backup', ok: true, detail: 'backed up' });
  } catch (e) {
    return fail('backup', (e as Error).message);
  }
  try {
    await target.apply(next);
    phases.push({ phase: 'update', ok: true, detail: `applied ${next}` });
  } catch (e) {
    await target.rollback();
    return fail('update', (e as Error).message);
  }
  const healthy = await target.healthCheck();
  if (!healthy) {
    await target.rollback();
    return fail('health', 'post-update health check failed; rolled back');
  }
  phases.push({ phase: 'health', ok: true, detail: 'healthy' });
  phases.push({ phase: 'done', ok: true, detail: 'updated' });
  return { ok: true, phases };
}
