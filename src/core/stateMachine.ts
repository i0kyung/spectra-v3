import type { StateName } from '../types';

export interface FsmInput {
  now: number;
  /** a candidate is dwelling toward a lock (pre-selection) */
  acquiring: boolean;
  /** the locked target is being seen this frame */
  targetPresent: boolean;
  /** high five fired this frame */
  highFiveFired: boolean;
}

export interface FsmTimes {
  greetingMs: number;
  graceMs: number;
  farewellMs: number;
  highFiveMs: number;
}

export interface FsmStep {
  state: StateName;
  changed: boolean;
  /** transitions worth logging as anonymous events */
  event?: 'session_start' | 'high_five' | 'session_end';
}

const DEFAULT_TIMES: FsmTimes = {
  greetingMs: 900,
  graceMs: 1500,
  farewellMs: 1400,
  highFiveMs: 1300,
};

/**
 * Behaviour FSM. Pure and clock-injected: every decision is a function of the
 * input and `now`, so tests drive it with a virtual clock. Camera failure is
 * handled OUTSIDE this machine (a system state) — call forceIdle() on recovery.
 */
export class StateMachine {
  private state: StateName = 'IDLE';
  private enteredAt = 0;
  private times: FsmTimes;

  constructor(times?: Partial<FsmTimes>) {
    this.times = { ...DEFAULT_TIMES, ...(times ?? {}) };
  }

  setTimes(times: Partial<FsmTimes>): void {
    this.times = { ...this.times, ...times };
  }

  get current(): StateName {
    return this.state;
  }

  timeInState(now: number): number {
    return now - this.enteredAt;
  }

  forceIdle(now: number): void {
    this.state = 'IDLE';
    this.enteredAt = now;
  }

  private go(next: StateName, now: number, event?: FsmStep['event']): FsmStep {
    this.state = next;
    this.enteredAt = now;
    return { state: next, changed: true, event };
  }

  private stay(): FsmStep {
    return { state: this.state, changed: false };
  }

  update(i: FsmInput): FsmStep {
    const dt = i.now - this.enteredAt;
    const T = this.times;

    switch (this.state) {
      case 'IDLE':
        if (i.targetPresent) return this.go('GREETING', i.now, 'session_start');
        if (i.acquiring) return this.go('ACQUIRING', i.now);
        return this.stay();

      case 'ACQUIRING':
        if (i.targetPresent) return this.go('GREETING', i.now, 'session_start');
        if (!i.acquiring) return this.go('IDLE', i.now);
        return this.stay();

      case 'GREETING':
        if (i.highFiveFired) return this.go('HIGH_FIVE', i.now, 'high_five');
        if (!i.targetPresent) return this.go('LOST_GRACE', i.now);
        if (dt >= T.greetingMs) return this.go('ENGAGED', i.now);
        return this.stay();

      case 'ENGAGED':
        if (i.highFiveFired) return this.go('HIGH_FIVE', i.now, 'high_five');
        if (!i.targetPresent) return this.go('LOST_GRACE', i.now);
        return this.stay();

      case 'HIGH_FIVE':
        if (dt >= T.highFiveMs) {
          return i.targetPresent ? this.go('ENGAGED', i.now) : this.go('LOST_GRACE', i.now);
        }
        return this.stay();

      case 'LOST_GRACE':
        if (i.targetPresent) return this.go('ENGAGED', i.now);
        if (dt >= T.graceMs) return this.go('FAREWELL', i.now);
        return this.stay();

      case 'FAREWELL':
        if (dt >= T.farewellMs) return this.go('IDLE', i.now, 'session_end');
        return this.stay();

      default:
        return this.stay();
    }
  }
}
