import { describe, expect, it } from 'vitest';
import { runCommand, tree, type TermCtx } from '../apps/web/lib/terminal';

const FS = {
  'src/app.ts': 'export const app = 1;\n',
  'src/utils.ts': 'export const u = 2;\n',
  'README.md': '# Aetherion\n',
  'notes/.keep': '',
};

function ctx(over: Partial<TermCtx> = {}): TermCtx {
  return {
    fs: { ...FS },
    cwd: '/',
    git: { branch: 'main', remote: false, lastFs: { ...FS } },
    gate: async () => ({ ok: true, risk: 'low' }),
    log: () => {},
    ...over,
  };
}

describe('sandbox terminal', () => {
  it('lists files relative to cwd', async () => {
    const r = await runCommand('ls src', ctx({ cwd: '/' }));
    expect(r.output).toContain('app.ts');
    expect(r.output).toContain('utils.ts');
  });

  it('prints file contents with cat', async () => {
    const r = await runCommand('cat README.md', ctx());
    expect(r.output).toContain('# Aetherion');
  });

  it('writes files with echo > (policy gate called)', async () => {
    const calls: string[] = [];
    const r = await runCommand('echo hello > out.txt', ctx({ gate: async (cat) => { calls.push(cat); return { ok: true, risk: 'low' }; } }));
    expect(calls).toContain('fs.write');
    expect(r.fs?.['out.txt']).toBe('hello\n');
  });

  it('refuses rm / and removes gated files otherwise', async () => {
    const refuse = await runCommand('rm -rf /', ctx());
    expect(refuse.output).toMatch(/refusing/);

    const ok = await runCommand('rm src/utils.ts', ctx());
    expect(ok.output).toMatch(/removed 1/);
    expect(ok.fs?.['src/utils.ts']).toBeUndefined();
    expect(ok.fs?.['src/app.ts']).toBeTruthy();

    const blocked = await runCommand('rm src/app.ts', ctx({ gate: async () => ({ ok: false, risk: 'high', note: 'not approved' }) }));
    expect(blocked.output).toContain('⛔');
    expect(blocked.fs).toBeUndefined(); // denied → no fs returned → nothing removed
  });

  it('classifies run <cmd> through the terminal gate', async () => {
    const blocked = await runCommand('run rm -rf /', ctx({ gate: async () => ({ ok: false, risk: 'critical', note: 'critical risk' }) }));
    expect(blocked.output).toContain('⛔');

    const tests = await runCommand('run npm test', ctx());
    expect(tests.output).toMatch(/sandbox/);
  });

  it('git status reports dirty files against the last commit fs', async () => {
    const dirty = { ...FS, 'src/app.ts': 'export const app = 99;\n' };
    const r = await runCommand('git status', ctx({ fs: dirty }));
    expect(r.output).toContain('On branch main');
    expect(r.output).toContain('src/app.ts');
    expect(r.output).not.toContain('src/utils.ts');
  });

  it('git push is gated and reports the branch when approved', async () => {
    const blocked = await runCommand('git push', ctx({ gate: async () => ({ ok: false, risk: 'medium', note: 'push requires approval' }) }));
    expect(blocked.output).toContain('⛔');
    const ok = await runCommand('git push', ctx());
    expect(ok.output).toContain('main');
  });

  it('clear emits the sentinel', async () => {
    const r = await runCommand('clear', ctx());
    expect(r.output).toBe('\u0000clear');
  });

  it('unknown commands give a helpful error', async () => {
    const r = await runCommand('frobnicate', ctx());
    expect(r.output).toMatch(/command not found/);
  });

  it('tree renders the workspace hierarchy', () => {
    const t = tree(FS);
    expect(t).toContain('src/');
    expect(t).toContain('app.ts');
    expect(t).toContain('README.md');
  });
});
