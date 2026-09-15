import { describe, it, expect } from 'vitest';
import { StateMachine, type FsmInput } from '../src/core/stateMachine';

const T = { greetingMs: 900, graceMs: 1500, farewellMs: 1400, highFiveMs: 1300 };
const base: Omit<FsmInput, 'now'> = { acquiring: false, targetPresent: false, highFiveFired: false };
const at = (now: number, o: Partial<FsmInput> = {}) => ({ now, ...base, ...o });

describe('StateMachine', () => {
  it('stays IDLE with no candidate and never false-greets', () => {
    const fsm = new StateMachine(T);
    for (let n = 0; n <= 30000; n += 100) {
      const s = fsm.update(at(n));
      expect(s.state).toBe('IDLE');
    }
  });

  it('acquires, greets (session_start), then engages', () => {
    const fsm = new StateMachine(T);
    expect(fsm.update(at(0, { acquiring: true })).state).toBe('ACQUIRING');
    const g = fsm.update(at(100, { targetPresent: true }));
    expect(g.state).toBe('GREETING');
    expect(g.event).toBe('session_start');
    expect(fsm.update(at(500, { targetPresent: true })).state).toBe('GREETING');
    expect(fsm.update(at(100 + T.greetingMs, { targetPresent: true })).state).toBe('ENGAGED');
  });

  it('ACQUIRING falls back to IDLE if the candidate disappears', () => {
    const fsm = new StateMachine(T);
    fsm.update(at(0, { acquiring: true }));
    expect(fsm.update(at(200, { acquiring: false })).state).toBe('IDLE');
  });

  it('fires HIGH_FIVE from ENGAGED and returns to ENGAGED', () => {
    const fsm = new StateMachine(T);
    fsm.update(at(0, { targetPresent: true })); // GREETING
    fsm.update(at(T.greetingMs, { targetPresent: true })); // ENGAGED
    const hf = fsm.update(at(2000, { targetPresent: true, highFiveFired: true }));
    expect(hf.state).toBe('HIGH_FIVE');
    expect(hf.event).toBe('high_five');
    expect(fsm.update(at(2000 + T.highFiveMs, { targetPresent: true })).state).toBe('ENGAGED');
  });

  it('re-engages when target returns within grace', () => {
    const fsm = new StateMachine(T);
    fsm.update(at(0, { targetPresent: true }));
    fsm.update(at(T.greetingMs, { targetPresent: true })); // ENGAGED
    expect(fsm.update(at(2000)).state).toBe('LOST_GRACE');
    expect(fsm.update(at(2000 + T.graceMs - 1, { targetPresent: true })).state).toBe('ENGAGED');
  });

  it('farewells then idles (session_end) when grace expires', () => {
    const fsm = new StateMachine(T);
    fsm.update(at(0, { targetPresent: true }));
    fsm.update(at(T.greetingMs, { targetPresent: true }));
    fsm.update(at(2000)); // LOST_GRACE at 2000
    expect(fsm.update(at(2000 + T.graceMs)).state).toBe('FAREWELL');
    const end = fsm.update(at(2000 + T.graceMs + T.farewellMs));
    expect(end.state).toBe('IDLE');
    expect(end.event).toBe('session_end');
  });

  it('forceIdle clears state (camera error recovery)', () => {
    const fsm = new StateMachine(T);
    fsm.update(at(0, { targetPresent: true }));
    fsm.forceIdle(500);
    expect(fsm.current).toBe('IDLE');
  });
});
