// §7 / §8 — State Machine & Resumable Tasks.
//
// Every asynchronous operation has explicit states. Tasks must never be left
// in ambiguous states, and must be resumable from the last completed
// checkpoint after a crash, disconnect, model/plugin failure or restart.

import type { FlowState, StateTransition } from './types';

/** A resumable checkpoint (§8). */
export interface Checkpoint {
  id: string;
  label: string;
  completed: boolean;
  ts?: string;
}

/** Allowed transitions. WAITING_* are paused states; FAILED recovers. */
export const TRANSITIONS: Record<FlowState, FlowState[]> = {
  QUEUED: ['PLANNING', 'CANCELLED'],
  PLANNING: ['WAITING_FOR_INPUT', 'WAITING_FOR_PERMISSION', 'RUNNING', 'FAILED', 'CANCELLED'],
  WAITING_FOR_INPUT: ['PLANNING', 'CANCELLED'],
  WAITING_FOR_PERMISSION: ['PLANNING', 'RUNNING', 'CANCELLED'],
  RUNNING: ['WAITING_FOR_TOOL', 'WAITING_FOR_PERMISSION', 'VERIFYING', 'COMPLETED', 'FAILED', 'CANCELLED'],
  WAITING_FOR_TOOL: ['RUNNING', 'FAILED', 'CANCELLED'],
  VERIFYING: ['COMPLETED', 'RUNNING', 'FAILED'],
  COMPLETED: [],
  FAILED: ['RETRYING', 'RECOVERING', 'CANCELLED'],
  RETRYING: ['RUNNING', 'FAILED', 'RECOVERING'],
  RECOVERING: ['RUNNING', 'COMPLETED', 'FAILED'],
  CANCELLED: [],
};

export function canTransition(from: FlowState, to: FlowState): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function nextStates(from: FlowState): FlowState[] {
  return TRANSITIONS[from] ?? [];
}

export class StateMachine {
  public history: StateTransition[] = [];

  constructor(
    public state: FlowState = 'QUEUED',
    history?: StateTransition[],
  ) {
    if (history) this.history = [...history];
  }

  /** Transition, enforcing the allowed state graph. Throws on illegal moves. */
  transition(to: FlowState, note?: string): void {
    if (!canTransition(this.state, to)) {
      throw new Error(`Illegal transition ${this.state} -> ${to}`);
    }
    this.history.push({ from: this.state, to, at: Date.now(), note });
    this.state = to;
  }

  /** Force a state without validation (used when restoring from a checkpoint). */
  restore(state: FlowState, note = 'resumed from checkpoint'): void {
    this.history.push({ from: this.state, to: state, at: Date.now(), note });
    this.state = state;
  }

  isTerminal(): boolean {
    return this.state === 'COMPLETED' || this.state === 'CANCELLED';
  }
}

/**
 * A resumable task tracks persisted checkpoints. If execution is interrupted,
 * resumeFrom() returns the first incomplete checkpoint so work continues
 * instead of restarting everything (§8).
 */
export class ResumableTask {
  constructor(
    public readonly id: string,
    public checkpoints: Checkpoint[] = [],
  ) {}

  /** Index of the last consecutively-completed checkpoint. */
  completedThrough(): number {
    let i = -1;
    for (let k = 0; k < this.checkpoints.length; k++) {
      if (this.checkpoints[k].completed) i = k;
      else break;
    }
    return i;
  }

  /** First checkpoint that is not yet completed, or undefined if all done. */
  resumeFrom(): Checkpoint | undefined {
    return this.checkpoints.find((c) => !c.completed);
  }

  markCompleted(checkpointId: string): void {
    const c = this.checkpoints.find((x) => x.id === checkpointId);
    if (c) {
      c.completed = true;
      c.ts = new Date().toISOString();
    }
  }

  /** Checkpoint ids not yet completed, in order. */
  remaining(): string[] {
    return this.checkpoints.filter((c) => !c.completed).map((c) => c.id);
  }
}
