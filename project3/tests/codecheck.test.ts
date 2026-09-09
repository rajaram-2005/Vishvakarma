import { describe, expect, it } from 'vitest';
import { checkFile, checkFileWithFs, runSuite } from '../apps/web/lib/codecheck';

describe('checkFile', () => {
  it('skips non-code files', () => {
    expect(checkFile('assets/logo.png', 'binary')).toEqual([]);
  });

  it('validates JSON files', () => {
    const good = checkFile('a.json', '{"ok": true}');
    expect(good.find((r) => r.check === 'valid JSON')?.status).toBe('pass');
    const bad = checkFile('a.json', '{oops');
    expect(bad.find((r) => r.check === 'valid JSON')?.status).toBe('fail');
  });

  it('detects unbalanced brackets', () => {
    const out = checkFile('src/broken.ts', 'function f() { return [1, 2;');
    const bal = out.find((r) => r.check === 'bracket balance');
    expect(bal?.status).toBe('fail');
  });

  it('passes balanced, clean files', () => {
    const out = checkFile('src/ok.ts', 'function f(): number { return 1; }\n');
    expect(out.find((r) => r.check === 'bracket balance')?.status).toBe('pass');
    expect(out.find((r) => r.check === 'TODO debt')?.status).toBe('pass');
  });

  it('warns on TODO markers', () => {
    const out = checkFile('src/todo.ts', 'const x = 1; // TODO: refactor\n');
    expect(out.find((r) => r.check === 'TODO debt')?.status).toBe('warn');
  });
});

describe('checkFileWithFs', () => {
  it('resolves relative imports against the workspace fs', () => {
    const fs = {
      'src/a.ts': "import { b } from './b';\nexport const a = b + 1;\n",
      'src/b.ts': 'export const b = 2;\n',
    };
    const out = checkFileWithFs('src/a.ts', fs['src/a.ts'], fs);
    const imp = out.filter((r) => r.check.toLowerCase().includes('import'));
    expect(imp.length).toBeGreaterThan(0);
    expect(imp.every((r) => r.status === 'pass')).toBe(true);
  });

  it('fails when a relative import target is missing', () => {
    const fs = { 'src/a.ts': "import { nope } from './missing';\nconst a = nope;\n" };
    const out = checkFileWithFs('src/a.ts', fs['src/a.ts'], fs);
    const imp = out.filter((r) => r.check.toLowerCase().includes('import'));
    expect(imp.some((r) => r.status === 'fail')).toBe(true);
  });
});

describe('runSuite', () => {
  it('checks every file in the fs and produces results', () => {
    const fs = {
      'src/one.ts': 'export const one = 1;\n',
      'two.json': '{"ok": 1}',
      'notes.md': '# Notes\nall good\n',
    };
    const out = runSuite(fs);
    expect(out.length).toBeGreaterThan(0);
    expect(new Set(out.map((r) => r.file))).toEqual(new Set(['src/one.ts', 'two.json', 'notes.md']));
  });
});
