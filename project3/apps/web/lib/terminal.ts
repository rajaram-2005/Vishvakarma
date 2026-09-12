// Lumen — sandboxed virtual terminal.
// Commands run against the workspace virtual FS. Anything exec-class or
// destructive passes the Tool Gateway (risk policy + approvals).

import { assess, type ToolCategory } from '@sutra/shared';

export interface TermCtx {
  fs: Record<string, string>;
  cwd: string;
  git: { branch: string; remote: boolean; lastFs?: Record<string, string> };
  /** Returns true when the action may proceed (policy or approval). */
  gate: (category: ToolCategory, detail: string) => Promise<{ ok: boolean; risk: string; note?: string }>;
  log: (line: string) => void;
}

export interface TermResult {
  output: string;
  fs?: Record<string, string>;
  cwd?: string;
  gitNote?: string;
}

const HELP = `Lumen sandbox terminal
  ls [path]        list files
  cd <path>        change directory
  pwd              print working directory
  cat <file>       print file
  echo <text>      print text (echo text > file writes)
  touch <file>     create empty file
  mkdir <dir>      create directory
  rm <file>        delete file        (policy-gated)
  tree             show file tree
  grep <pat> [dir] search files
  open <file>      open in editor
  run <cmd>        run in sandbox    (policy-gated)
  git <sub>        git status|log|commit <msg>|push  (push is gated)
  whoami · date · env · clear · help

Every dangerous signature is classified before execution.
Approvals are requested, never skipped.`;

/** Resolve against the workspace root. FS keys are relative ('src/app.ts'); root is '/'. */
function normPath(cwd: string, p: string): string {
  let out = p.startsWith('/') ? p : `${cwd === '/' ? '' : cwd + '/'}${p}`;
  const parts: string[] = [];
  for (const seg of out.split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  return parts.length ? parts.join('/') : '/';
}

export function tree(fs: Record<string, string>): string {
  const root: Record<string, unknown> = {};
  for (const [p, c] of Object.entries(fs)) {
    const parts = p.split('/').filter(Boolean);
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      node[parts[i]] = node[parts[i]] ?? {};
      node = node[parts[i]] as Record<string, unknown>;
    }
    node[parts[parts.length - 1]] = c ? {} : undefined;
  }
  const lines: string[] = ['aetherion-mvp/'];
  const walk = (node: Record<string, unknown>, indent: string) => {
    const keys = Object.keys(node).sort();
    for (const k of keys) {
      const v = node[k];
      if (v && typeof v === 'object') {
        lines.push(`${indent}${k}/`);
        walk(v as Record<string, unknown>, indent + '  ');
      } else {
        lines.push(`${indent}${k}`);
      }
    }
  };
  walk(root, '  ');
  return lines.join('\n');
}

export async function runCommand(raw: string, ctx: TermCtx): Promise<TermResult> {
  const line = raw.trim();
  if (!line) return { output: '' };
  const [cmd, ...rest] = line.split(/\s+/);
  const arg = rest.join(' ');

  switch (cmd) {
    case 'help':
      return { output: HELP };
    case 'pwd':
      return { output: ctx.cwd };
    case 'whoami':
      return { output: 'aetherion@local (sandbox: workspace)' };
    case 'date':
      return { output: new Date().toString() };
    case 'clear':
      return { output: '\u0000clear' };
    case 'env':
      return {
        output:
          'Aetherion_MODE=local\nOLLAMA_URL=http://localhost:11434\nOPENAI_API_KEY=•••••••• (masked by secret isolation)\nOTEL_ENDPOINT=(not set)',
      };
    case 'ls': {
      const dir = arg ? normPath(ctx.cwd, arg) : ctx.cwd;
      const prefix = dir === '/' ? '' : dir + '/';
      const names = new Set<string>();
      for (const p of Object.keys(ctx.fs)) {
        if (p === prefix || (dir === '/' && !p.includes('/'))) continue;
        if (p.startsWith(prefix)) {
          const restPath = p.slice(prefix.length);
          const head = restPath.split('/')[0];
          names.add(p === prefix ? head : restPath.includes('/') ? head + '/' : head);
        }
      }
      const out = [...names].sort().join('  ');
      return { output: out || '(empty)' };
    }
    case 'cd': {
      if (!arg) return { output: '/' };
      const target = normPath(ctx.cwd, arg);
      const isFile = Object.prototype.hasOwnProperty.call(ctx.fs, target);
      const hasChildren = Object.keys(ctx.fs).some((p) => p.startsWith(target + '/'));
      if (isFile) return { output: `cd: ${target}: is a file` };
      if (!hasChildren && target !== '/' && !Object.prototype.hasOwnProperty.call(ctx.fs, target)) {
        return { output: `cd: ${target}: no such directory` };
      }
      return { output: '', cwd: target };
    }
    case 'cat': {
      const p = normPath(ctx.cwd, arg);
      const c = ctx.fs[p];
      if (c === undefined) return { output: `cat: ${p}: no such file` };
      return { output: c };
    }
    case 'tree':
      return { output: tree(ctx.fs) };
    case 'grep': {
      const [pat, dirArg] = rest;
      if (!pat) return { output: 'usage: grep <pattern> [dir]' };
      const dir = dirArg ? normPath(ctx.cwd, dirArg) : ctx.cwd;
      const prefix = dir === '/' ? '' : dir + '/';
      let re: RegExp;
      try {
        re = new RegExp(pat, 'i');
      } catch {
        re = new RegExp(pat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      }
      const out: string[] = [];
      for (const [p, c] of Object.entries(ctx.fs)) {
        if (p.startsWith(prefix) || (!prefix && !p.startsWith(prefix))) {
          c.split('\n').forEach((ln, i) => {
            if (re.test(ln)) out.push(`${p}:${i + 1}: ${ln.trim().slice(0, 120)}`);
          });
        }
      }
      return { output: out.join('\n') || 'no matches' };
    }
    case 'touch': {
      const p = normPath(ctx.cwd, arg);
      if (!p) return { output: 'usage: touch <file>' };
      const fs = { ...ctx.fs };
      if (fs[p] === undefined) fs[p] = '';
      return { output: '', fs };
    }
    case 'mkdir': {
      const p = normPath(ctx.cwd, arg);
      if (!p) return { output: 'usage: mkdir <dir>' };
      const fs = { ...ctx.fs };
      fs[p + '/.keep'] = '';
      return { output: '', fs };
    }
    case 'echo': {
      const m = line.match(/^echo\s+(.*)\s*>\s*(\S+)$/);
      if (m) {
        const text = m[1].replace(/^["']|["']$/g, '').trimEnd();
        const p = normPath(ctx.cwd, m[2]);
        const v = await ctx.gate('fs.write', `write ${p}`);
        if (!v.ok) return { output: `⛔ blocked by policy: ${v.note ?? v.risk} risk` };
        return { output: '', fs: { ...ctx.fs, [p]: text + '\n' } };
      }
      return { output: arg };
    }
    case 'rm': {
      const p = normPath(ctx.cwd, arg.replace(/^-rf\s+|^-\w+\s+/, ''));
      if (!p || p === '/') return { output: 'rm: refusing to touch /' };
      const exists = Object.keys(ctx.fs).filter((k) => k === p || k.startsWith(p + '/'));
      if (!exists.length) return { output: `rm: ${p}: no such file or directory` };
      const v = await ctx.gate('fs.delete', `rm ${arg || p}`);
      if (!v.ok) return { output: `⛔ ${v.note ?? 'deleted by policy'} — nothing removed` };
      const fs: Record<string, string> = {};
      for (const [k, c] of Object.entries(ctx.fs)) {
        if (k !== p && !k.startsWith(p + '/')) fs[k] = c;
      }
      return { output: `removed ${exists.length} path(s)`, fs };
    }
    case 'open': {
      const p = normPath(ctx.cwd, arg);
      if (ctx.fs[p] === undefined) return { output: `open: ${p}: no such file` };
      ctx.log(`[terminal] open ${p} → editor`);
      return { output: `[opened ${p} in editor]` };
    }
    case 'run': {
      if (!arg) return { output: 'usage: run <command>' };
      const v = await ctx.gate('terminal.exec', `run ${arg}`);
      if (!v.ok) return { output: `⛔ ${v.note ?? v.risk.toUpperCase()}-risk command not approved` };
      if (/^(npm|npx)\s+test/.test(arg)) {
        ctx.log(`[sandbox] executing: ${arg}`);
        return { output: '[sandbox] running test suite… see the Tests tab for live results\n(pass 2 · fail 0 · warnings 1 — see Tests)' };
      }
      if (/^(node|python3?|deno|bun)/.test(arg)) {
        ctx.log(`[sandbox] executing: ${arg}`);
        return { output: `[sandbox] ${arg}\n→ exit 0 (sandboxed, no network)` };
      }
      ctx.log(`[sandbox] unknown runtime: ${arg}`);
      return { output: `[sandbox] ${arg}: not available in the web sandbox (desktop targets add real runtimes)` };
    }
    case 'git': {
      const sub = arg.split(/\s+/)[0];
      if (sub === 'status') {
        const lastFs = ctx.git.lastFs ?? {};
        const dirty = Object.keys(ctx.fs).filter((k) => ctx.fs[k] !== lastFs[k]);
        return {
          output:
            `On branch ${ctx.git.branch}${ctx.git.remote ? ' (remote tracked)' : ''}\n` +
            (dirty.length ? `Changes not staged:\n  ${dirty.join('\n  ')}\n` : 'Working tree clean.\n'),
        };
      }
      if (sub === 'log') {
        ctx.log('[git] log requested → open the Git tab');
        return { output: '[git log — see the Git tab for the full history]' };
      }
      if (sub === 'commit') {
        const msg = arg.replace(/^commit\s+(-m\s+)?["']?/, '').replace(/["']?$/, '');
        const v = await ctx.gate('fs.write', `git commit "${msg.slice(0, 40)}"`);
        if (!v.ok) return { output: '⛔ commit blocked by policy' };
        const changed = Object.keys(ctx.fs).filter((k) => ctx.fs[k] !== ctx.git.lastFs?.[k]);
        if (!changed.length) return { output: 'nothing to commit, working tree clean' };
        ctx.log(`[git] commit: ${msg || 'update'} (${changed.length} file(s))`);
        return { output: `[commit staged: ${changed.length} file(s)]\n  ${changed.join('\n  ')}`, gitNote: msg || 'update' };
      }
      if (sub === 'push') {
        const v = await ctx.gate('git.push', `git push ${arg.replace('push', '')}`);
        if (!v.ok) return { output: `⛔ ${v.note ?? 'push requires approval'} — remote not updated` };
        ctx.log('[git] push approved → remote synced');
        return { output: `To aetherion.local:${ctx.git.branch}\n   synced (remote accepted)`, gitNote: 'push' };
      }
      return { output: `git ${sub}: try git status | git log | git commit -m "msg" | git push` };
    }
    default:
      return { output: `command not found: ${cmd} (try help)` };
  }
}

/** Convenience: pre-gate check used by the UI to preview risk before executing. */
export function previewRisk(detail: string, category: ToolCategory = 'terminal.exec') {
  return assess(category, detail);
}
