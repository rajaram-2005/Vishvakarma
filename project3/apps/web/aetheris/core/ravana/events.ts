/**
 * RAVANA · Streaming event bus (spec §16).
 *
 * The engine emits typed events; the SSE stream replays live events then the terminal snapshot.
 * Events are also appended to the persisted task record (capped), so a finished task keeps its
 * execution trace. UI shows traces, never hidden chain-of-thought.
 */
import type { RavanaEvent, RavanaEventType, RavanaTask } from "./types";

export type TaskListener = (e: RavanaEvent, task: RavanaTask) => void;

interface LiveEntry {
  listeners: Set<TaskListener>;
}

const live = new Map<string, LiveEntry>();

export function isLive(id: string): boolean {
  return live.has(id);
}

export function attach(taskId: string): void {
  if (!live.has(taskId)) live.set(taskId, { listeners: new Set() });
}

export function subscribe(taskId: string, cb: TaskListener): (() => void) | null {
  const entry = live.get(taskId);
  if (!entry) return null;
  entry.listeners.add(cb);
  return () => entry.listeners.delete(cb);
}

export function detach(taskId: string): void {
  live.delete(taskId);
}

export const MAX_EVENTS = 500;

/** Append an event to the task trace and fan it out to subscribers. Returns the event. */
export function emit(task: RavanaTask, type: RavanaEventType, payload?: Record<string, unknown>): RavanaEvent {
  const ev: RavanaEvent = { seq: (task.events.at(-1)?.seq ?? 0) + 1, at: Date.now(), type, payload };
  task.events.push(ev);
  if (task.events.length > MAX_EVENTS) task.events.splice(0, task.events.length - MAX_EVENTS);
  const entry = live.get(task.id);
  if (entry) for (const cb of entry.listeners) cb(ev, task);
  return ev;
}
