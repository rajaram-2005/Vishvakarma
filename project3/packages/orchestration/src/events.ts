// §45 — Event Bus.
//
// A reliable, typed pub/sub backbone so modules communicate without
// hard-coded dependencies. Supports wildcards, once-handlers and async
// listeners with per-handler error isolation.

import type { DomainEventMap, EventName } from './types';

type Handler<K extends EventName> = (payload: DomainEventMap[K]) => void | Promise<void>;
type WildcardHandler = (name: EventName, payload: Record<string, unknown>) => void | Promise<void>;
type AnyHandler = Handler<EventName> | WildcardHandler;

export interface EventBusStats {
  emitted: number;
  handlers: number;
  errors: number;
}

export class EventBus<M extends DomainEventMap = DomainEventMap> {
  private listeners = new Map<EventName | '*', Set<AnyHandler>>();
  private stats: EventBusStats = { emitted: 0, handlers: 0, errors: 0 };

  on<K extends EventName>(name: K, handler: Handler<K>): () => void {
    this.register(name, handler as AnyHandler);
    return () => this.off(name, handler as AnyHandler);
  }

  onAny(handler: WildcardHandler): () => void {
    this.register('*', handler);
    return () => this.off('*', handler);
  }

  once<K extends EventName>(name: K, handler: Handler<K>): () => void {
    const wrap: Handler<K> = (payload) => {
      this.off(name, wrap as AnyHandler);
      return handler(payload);
    };
    return this.on(name, wrap);
  }

  off(name: EventName | '*', handler: AnyHandler): void {
    this.listeners.get(name)?.delete(handler);
  }

  private register(name: EventName | '*', handler: AnyHandler): void {
    const set = this.listeners.get(name) ?? new Set<AnyHandler>();
    set.add(handler);
    this.listeners.set(name, set);
  }

  /** Emit and await all listeners (specific + wildcard). Errors are isolated. */
  async emit<K extends EventName>(name: K, payload: M[K]): Promise<void> {
    this.stats.emitted += 1;
    const specific = [...(this.listeners.get(name) ?? [])];
    const wild = [...(this.listeners.get('*') ?? [])];
    this.stats.handlers += specific.length + wild.length;
    await Promise.all(
      specific.map(async (h) => {
        try {
          await (h as Handler<K>)(payload);
        } catch (e) {
          this.stats.errors += 1;
          // Surface but never let one bad listener break the emit.
          if (typeof console !== 'undefined') {
            console.warn(`[eventbus] listener for ${name} failed`, (e as Error).message);
          }
        }
      }),
    );
    // Run wildcard listeners with (name, payload).
    await Promise.all(
      wild.map(async (h) => {
        try {
          await (h as WildcardHandler)(name, payload as Record<string, unknown>);
        } catch (e) {
          this.stats.errors += 1;
          if (typeof console !== 'undefined') {
            console.warn(`[eventbus] wildcard listener failed`, (e as Error).message);
          }
        }
      }),
    );
  }

  listenerCount(name?: EventName): number {
    if (name) return this.listeners.get(name)?.size ?? 0;
    return [...this.listeners.values()].reduce((a, s) => a + s.size, 0);
  }

  getStats(): EventBusStats {
    return { ...this.stats };
  }

  clear(): void {
    this.listeners.clear();
  }
}
