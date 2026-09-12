import { describe, it, expect, vi } from 'vitest';
import { EventBus } from './events';

describe('EventBus', () => {
  it('delivers emitted events to subscribers', async () => {
    const bus = new EventBus();
    const fn = vi.fn();
    bus.on('chat.completed', fn);
    await bus.emit('chat.completed', { conversationId: 'c1', model: 'm1' });
    expect(fn).toHaveBeenCalledOnce();
    expect(fn).toHaveBeenCalledWith({ conversationId: 'c1', model: 'm1' });
  });

  it('supports once()', async () => {
    const bus = new EventBus();
    const fn = vi.fn();
    bus.once('model.installed', fn);
    await bus.emit('model.installed', { modelId: 'm' });
    await bus.emit('model.installed', { modelId: 'm' });
    expect(fn).toHaveBeenCalledOnce();
  });

  it('off() unsubscribes', async () => {
    const bus = new EventBus();
    const fn = vi.fn();
    const off = bus.on('plugin.updated', fn);
    off();
    await bus.emit('plugin.updated', { pluginId: 'p' });
    expect(fn).not.toHaveBeenCalled();
  });

  it('supports wildcard listeners', async () => {
    const bus = new EventBus();
    const fn = vi.fn();
    bus.onAny(fn);
    await bus.emit('security.alert', { risk: 'high', detail: 'x' });
    expect(fn).toHaveBeenCalledWith('security.alert', { risk: 'high', detail: 'x' });
  });

  it('awaits async listeners', async () => {
    const bus = new EventBus();
    let done = false;
    bus.on('task.completed', async () => {
      await new Promise((r) => setTimeout(r, 5));
      done = true;
    });
    await bus.emit('task.completed', { taskId: 't' });
    expect(done).toBe(true);
  });

  it('isolates listener errors', async () => {
    const bus = new EventBus();
    const good = vi.fn();
    bus.on('task.completed', () => {
      throw new Error('boom');
    });
    bus.on('task.completed', good);
    await expect(bus.emit('task.completed', { taskId: 't' })).resolves.toBeUndefined();
    expect(good).toHaveBeenCalled();
    expect(bus.getStats().errors).toBeGreaterThanOrEqual(1);
  });

  it('tracks stats', async () => {
    const bus = new EventBus();
    bus.on('task.completed', () => {});
    await bus.emit('task.completed', { taskId: 't' });
    const s = bus.getStats();
    expect(s.emitted).toBe(1);
    expect(s.handlers).toBe(1);
  });
});
