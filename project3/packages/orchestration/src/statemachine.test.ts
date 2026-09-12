import { describe, it, expect } from 'vitest';
import {
  StateMachine,
  ResumableTask,
  canTransition,
  nextStates,
} from './statemachine';

describe('StateMachine', () => {
  it('enforces legal transitions', () => {
    expect(canTransition('QUEUED', 'PLANNING')).toBe(true);
    expect(canTransition('RUNNING', 'VERIFYING')).toBe(true);
    expect(canTransition('RUNNING', 'COMPLETED')).toBe(true);
    expect(canTransition('COMPLETED', 'RUNNING')).toBe(false);
    expect(canTransition('QUEUED', 'COMPLETED')).toBe(false);
  });

  it('throws on illegal transitions', () => {
    const sm = new StateMachine('QUEUED');
    expect(() => sm.transition('COMPLETED')).toThrow(/Illegal/);
  });

  it('records history', () => {
    const sm = new StateMachine('QUEUED');
    sm.transition('PLANNING');
    sm.transition('RUNNING');
    expect(sm.history).toHaveLength(2);
    expect(sm.state).toBe('RUNNING');
  });

  it('models the failure recovery path', () => {
    const sm = new StateMachine('RUNNING');
    sm.transition('FAILED');
    sm.transition('RETRYING');
    sm.transition('RUNNING');
    expect(sm.state).toBe('RUNNING');
  });

  it('restore() jumps state without a transition check', () => {
    const sm = new StateMachine('QUEUED');
    sm.restore('RUNNING', 'resumed');
    expect(sm.state).toBe('RUNNING');
    expect(sm.history.at(-1)?.note).toBe('resumed');
  });

  it('lists next states', () => {
    expect(nextStates('RUNNING').sort()).toEqual(
      ['CANCELLED', 'COMPLETED', 'FAILED', 'VERIFYING', 'WAITING_FOR_PERMISSION', 'WAITING_FOR_TOOL'].sort(),
    );
  });
});

describe('ResumableTask', () => {
  const mk = () =>
    new ResumableTask('t1', [
      { id: 'c1', label: 'one', completed: true },
      { id: 'c2', label: 'two', completed: true },
      { id: 'c3', label: 'three', completed: false },
      { id: 'c4', label: 'four', completed: false },
    ]);

  it('reports completed-through index', () => {
    expect(mk().completedThrough()).toBe(1);
  });

  it('resumes from first incomplete checkpoint', () => {
    expect(mk().resumeFrom()?.id).toBe('c3');
  });

  it('marks checkpoints and advances remaining', () => {
    const t = mk();
    t.markCompleted('c3');
    expect(t.resumeFrom()?.id).toBe('c4');
    expect(t.remaining()).toEqual(['c4']);
    t.markCompleted('c4');
    expect(t.resumeFrom()).toBeUndefined();
  });
});
