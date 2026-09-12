import { describe, it, expect } from 'vitest';
import {
  MemoryStorage,
  ChatService,
  LibraryService,
  SchedulerService,
  ModelManager,
  PluginSystem,
  McpSystem,
  SearchService,
  Platform,
  MockModelAdapter,
  MockPluginAdapter,
  MockMcpAdapter,
  contractTestModel,
  contractTestCallable,
  buildSampleCore,
  sampleContext,
  SAMPLE_REQUEST,
} from './index';
import type { NodeExecutor } from './types';

const exec: NodeExecutor = {
  async execute(node) {
    return { result: `ok:${node.id}`, evidence: [`ev:${node.id}`] };
  },
};

describe('Storage (§121)', () => {
  it('persists and lists across collections', () => {
    const s = new MemoryStorage();
    s.set('library', 'a', { id: 'a' });
    s.set('library', 'b', { id: 'b' });
    expect(s.list('library')).toHaveLength(2);
    expect(s.get('library', 'a')).toBeTruthy();
    expect(s.keys('library')).toEqual(['a', 'b']);
    expect(s.delete('library', 'a')).toBe(true);
    expect(s.list('library')).toHaveLength(1);
  });
});

describe('Surface services on top of the core', () => {
  it('ChatService plans and runs a request through the core', async () => {
    const chat = new ChatService(buildSampleCore());
    const r = await chat.ask(SAMPLE_REQUEST, exec, sampleContext);
    expect(r.failed).toEqual([]);
    expect(r.completed.length).toBeGreaterThan(0);
  });

  it('LibraryService saves and searches assets', () => {
    const lib = new LibraryService(buildSampleCore());
    lib.save({ title: 'EV Paper', text: 'solar EV charging research', tags: ['ev'] });
    expect(lib.list()).toHaveLength(1);
    expect(lib.search('EV').length).toBeGreaterThan(0);
  });

  it('SchedulerService schedules and ticks due jobs through the core', async () => {
    const core = buildSampleCore();
    const sch = new SchedulerService(core);
    sch.schedule('Daily digest', SAMPLE_REQUEST, 'daily', 'UTC');
    const before = new Date(Date.now() + 86400000).toISOString(); // force due
    const results = await sch.tick(exec, sampleContext, new Date(before));
    expect(Object.keys(results).length).toBeGreaterThan(0);
  });

  it('ModelManager routes by mode', () => {
    const m = new ModelManager(buildSampleCore());
    expect(m.list().length).toBeGreaterThan(0);
    const chosen = m.route('quality', sampleContext, 'write a function');
    expect(chosen).toBeTruthy();
  });

  it('Plugin/MCP systems register capabilities', () => {
    const core = buildSampleCore();
    const p = new PluginSystem(core);
    p.install({ id: 'github', name: 'GitHub', permissions: ['network.request'] });
    const mcp = new McpSystem(core);
    mcp.install({ id: 'fs', name: 'Filesystem', tools: ['read', 'write'] });
    expect(p.list().some((c) => c.id === 'github')).toBe(true);
    expect(mcp.list().some((c) => c.id === 'fs')).toBe(true);
  });

  it('SearchService indexes capabilities', () => {
    const s = new SearchService(buildSampleCore());
    expect(s.search('search').length).toBeGreaterThan(0);
  });
});

describe('Adapters & contract testing (§96)', () => {
  it('MockModelAdapter passes the model contract', async () => {
    const r = await contractTestModel(new MockModelAdapter('m1'));
    expect(r.ok).toBe(true);
    expect(r.passed).toContain('input: rejects empty prompt');
  });
  it('plugin and mcp adapters satisfy the callable contract', async () => {
    expect((await contractTestCallable(new MockPluginAdapter('p1'), 'plugin')).ok).toBe(true);
    expect((await contractTestCallable(new MockMcpAdapter('mcp1'), 'mcp')).ok).toBe(true);
  });
});

describe('Platform facade (§120/§121)', () => {
  it('assembles the full studio and runs end-to-end', async () => {
    const p = new Platform({ seedSample: true });
    const chat = await p.chat();
    expect(chat.failed).toEqual([]);
    p.saveToLibrary('Notes', 'some knowledge', ['notes']);
    p.installPlugin({ id: 'demo-plugin', name: 'Demo' });
    p.installMcp({ id: 'demo-mcp', name: 'Demo MCP', tools: ['x'] });
    const wf = await p.runWorkflow('research-report');
    expect(wf.debug.every((d) => d.status === 'completed')).toBe(true);
    const status = p.status();
    expect(status.capabilities).toBeGreaterThan(0);
    expect(status.library).toBe(1);
    expect(status.plugins).toBeGreaterThan(0);
    expect(status.mcps).toBeGreaterThan(0);
  });
});
