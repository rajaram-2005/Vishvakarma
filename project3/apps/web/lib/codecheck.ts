// Lumen — deterministic code checks (the "Tests" tab and Tester agent).
// Real computation over the virtual FS: balance, structure, imports, TODOs.

export interface CheckResult {
  file: string;
  check: string;
  status: 'pass' | 'fail' | 'warn';
  detail: string;
}

const CODE_EXT = /\.(ts|tsx|js|jsx|py|json|md|css)$/;

function balanced(s: string, open: string, close: string): number {
  let d = 0;
  for (const ch of s) {
    if (ch === open) d++;
    else if (ch === close) d--;
  }
  return d;
}

export function checkFile(path: string, content: string): CheckResult[] {
  const out: CheckResult[] = [];
  if (!CODE_EXT.test(path)) return out;

  const isJson = path.endsWith('.json');
  const isMd = path.endsWith('.md');

  if (isJson) {
    try {
      JSON.parse(content);
      out.push({ file: path, check: 'valid JSON', status: 'pass', detail: 'parses cleanly' });
    } catch (e) {
      out.push({ file: path, check: 'valid JSON', status: 'fail', detail: String((e as Error).message).slice(0, 90) });
    }
    return out;
  }

  if (!isMd) {
    const b = balanced(content, '(', ')') + balanced(content, '{', '}') + balanced(content, '[', ']');
    out.push({
      file: path,
      check: 'bracket balance',
      status: b === 0 ? 'pass' : 'fail',
      detail: b === 0 ? 'all pairs closed' : `net balance ${b > 0 ? '+' : ''}${b} — unclosed construct`,
    });
    const quotes = (content.match(/"/g)?.length ?? 0);
    out.push({
      file: path,
      check: 'string quotes',
      status: quotes % 2 === 0 ? 'pass' : 'warn',
      detail: quotes % 2 === 0 ? 'quotes paired' : 'odd number of " — check templates',
    });
  }

  const lines = content.split('\n');
  const todos = lines.filter((l) => /\bTODO\b|\bFIXME\b/.test(l)).length;
  out.push({
    file: path,
    check: 'TODO debt',
    status: todos === 0 ? 'pass' : 'warn',
    detail: todos === 0 ? 'no open TODOs' : `${todos} TODO/FIXME marker(s)`,
  });

  const loc = lines.filter((l) => l.trim()).length;
  out.push({
    file: path,
    check: 'size budget',
    status: loc <= 400 ? 'pass' : 'warn',
    detail: `${loc} lines of code`,
  });

  // (import resolution needs the FS — see checkFileWithFs)
  return out;
}

function normalize(base: string, imp: string): string {
  const parts = (base ? base.split('/') : []).concat(imp.split('/'));
  const out: string[] = [];
  for (const p of parts) {
    if (!p || p === '.') continue;
    if (p === '..') out.pop();
    else out.push(p);
  }
  return out.join('/');
}

export function runSuite(fs: Record<string, string>): CheckResult[] {
  const out: CheckResult[] = [];
  for (const [p, c] of Object.entries(fs).sort()) {
    out.push(...checkFileWithFs(p, c, fs));
  }
  return out;
}

// re-export a variant that knows the FS so import checks can be real
export function checkFileWithFs(path: string, content: string, fs: Record<string, string>): CheckResult[] {
  const res = checkFile(path, content);
  if (!/\.(ts|tsx|js|jsx|py)$/.test(path)) return res;
  const imports = [...content.matchAll(/from\s+['"](\.[^'"]+)['"]/g)].map((m) => m[1]);
  for (const imp of imports.slice(0, 6)) {
    const base = path.split('/').slice(0, -1).join('/');
    const target = normalize(base, imp);
    const exists = [target, target + '.ts', target + '.tsx', target + '/index.ts', target + '.js', target + '.json'].some(
      (t) => Object.prototype.hasOwnProperty.call(fs, t),
    );
    const entry: CheckResult = {
      file: path,
      check: `import resolves (${imp})`,
      status: exists ? 'pass' : 'fail',
      detail: exists ? 'found in workspace' : 'not found in virtual FS',
    };
    const idx = res.findIndex((r) => r.check.startsWith(`import resolves (${imp})`));
    if (idx >= 0) res[idx] = entry;
    else res.push(entry);
  }
  return res;
}
