// Lumen — virtual git: commits, history, dirty-state over the FS snapshot.

import { shortHash } from '@sutra/shared';
import type { GitCommit, GitState } from '@sutra/shared';

export function dirtyFiles(fs: Record<string, string>, lastFs: Record<string, string>): string[] {
  const out = new Set<string>([...Object.keys(fs), ...Object.keys(lastFs)]);
  return [...out].filter((k) => (fs[k] ?? '') !== (lastFs[k] ?? '')).sort();
}

export function makeCommit(
  fs: Record<string, string>,
  message: string,
  branch: string,
): { commit: GitCommit; lastFs: Record<string, string> } {
  const files = dirtyFiles(fs, {});
  void files;
  const commit: GitCommit = {
    hash: shortHash(JSON.stringify(Object.entries(fs).sort()) + message + Date.now()),
    message,
    files: Object.keys(fs),
    ts: new Date().toISOString(),
    branch,
  };
  return { commit, lastFs: { ...fs } };
}

export function commitFromDirty(
  git: GitState,
  fs: Record<string, string>,
  message: string,
): { commit: GitCommit | null; git: GitState } {
  const dirty = dirtyFiles(fs, git.lastFs);
  if (!dirty.length) return { commit: null, git };
  const commit: GitCommit = {
    hash: shortHash(JSON.stringify(Object.entries(fs).sort()) + message),
    message,
    files: dirty,
    ts: new Date().toISOString(),
    branch: git.branch,
  };
  return { commit, git: { ...git, log: [commit, ...git.log].slice(0, 200), lastFs: { ...fs } } };
}
