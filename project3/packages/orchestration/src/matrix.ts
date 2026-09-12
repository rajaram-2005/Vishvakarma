// §60 / §61 / §62 — Offline/Online Capability Matrix, Offline Cache policy and
// Connectivity Recovery. The UI and execution engine consult the matrix
// instead of guessing whether something works offline.

export type OnlineState = 'yes' | 'no' | 'if-installed' | 'limited' | 'cached' | 'only-offline-compatible' | 'only-local-compatible' | 'no-remote';

export interface MatrixRow {
  capability: string;
  online: OnlineState;
  offline: OnlineState;
}

/** The authoritative matrix from spec §60. */
const MATRIX: MatrixRow[] = [
  { capability: 'chat', online: 'yes', offline: 'yes' },
  { capability: 'local-advice', online: 'yes', offline: 'yes' },
  { capability: 'cloud-models', online: 'yes', offline: 'no' },
  { capability: 'local-models', online: 'yes', offline: 'if-installed' },
  { capability: 'studio-cloud', online: 'yes', offline: 'no' },
  { capability: 'image-generation', online: 'yes', offline: 'if-installed' },
  { capability: 'video-generation', online: 'yes', offline: 'if-installed' },
  { capability: 'cloud-coder', online: 'yes', offline: 'no' },
  { capability: 'local-coder', online: 'yes', offline: 'limited' },
  { capability: 'library-local', online: 'yes', offline: 'yes' },
  { capability: 'library-cloud', online: 'yes', offline: 'cached' },
  { capability: 'plugins', online: 'yes', offline: 'only-offline-compatible' },
  { capability: 'mcp', online: 'yes', offline: 'only-local-compatible' },
  { capability: 'schedules', online: 'yes', offline: 'no-remote' },
  { capability: 'marketplace', online: 'yes', offline: 'no' },
  { capability: 'collaboration', online: 'yes', offline: 'no' },
  { capability: 'account-sync', online: 'yes', offline: 'no' },
];

export const CAPABILITY_MATRIX: MatrixRow[] = MATRIX;

export function matrixRow(capability: string): MatrixRow | undefined {
  return MATRIX.find((r) => r.capability === capability);
}

/** Can `capability` run in the current connectivity mode? */
export function worksOffline(capability: string): boolean {
  const row = matrixRow(capability);
  if (!row) return false;
  return (
    row.offline === 'yes' ||
    row.offline === 'if-installed' ||
    row.offline === 'limited' ||
    row.offline === 'cached' ||
    row.offline === 'only-offline-compatible' ||
    row.offline === 'only-local-compatible'
  );
}

export type CacheScope = 'recent-chats' | 'local-projects' | 'selected-library' | 'settings' | 'model-metadata';

/** §61 — Never silently cache private cloud data beyond the user's settings. */
export class OfflineCachePolicy {
  private permitted = new Set<CacheScope>();

  permit(scope: CacheScope): void {
    this.permitted.add(scope);
  }

  revoke(scope: CacheScope): void {
    this.permitted.delete(scope);
  }

  canCache(scope: CacheScope): boolean {
    return this.permitted.has(scope);
  }

  /** Default policy: only explicitly-permitted scopes, never private cloud. */
  static default(): OfflineCachePolicy {
    const p = new OfflineCachePolicy();
    p.permit('local-projects');
    p.permit('settings');
    p.permit('model-metadata');
    return p;
  }
}

/**
 * §62 — Connectivity recovery. When the internet returns, show a sync preview
 * and let the user's policy decide. We never auto-upload everything.
 */
export type SyncAction = 'skip' | 'sync-preview' | 'sync';

export class ConnectivityRecovery {
  constructor(private readonly policy: 'sync-all' | 'preview-first' | 'manual' = 'preview-first') {}

  onReconnect(pendingUploads: number): SyncAction {
    if (pendingUploads === 0) return 'skip';
    if (this.policy === 'sync-all') return 'sync';
    if (this.policy === 'manual') return 'skip';
    return 'sync-preview'; // preview-first: surface a preview, wait for user
  }
}
