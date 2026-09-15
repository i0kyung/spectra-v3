import { describe, it, expect } from 'vitest';
import { TrackManager } from '../src/core/trackManager';
import { TargetSelector } from '../src/core/targetSelector';
import { StateMachine } from '../src/core/stateMachine';
import { DEFAULT_CONFIG } from '../src/config';
import type { Config, DetectionFrame, StateName, Vec2 } from '../src/types';

// A DOM-free harness that mirrors the engine's core decisions (selection,
// grace + re-acquire, behaviour FSM) so scenarios can be tested deterministically.
class Harness {
  tm: TrackManager;
  sel = new TargetSelector();
  fsm: StateMachine;
  lastPos: Vec2 | null = null;
  constructor(private cfg: Config) {
    this.tm = new TrackManager(cfg.trackMatchDist, cfg.trackTtlMs);
    this.fsm = new StateMachine({ greetingMs: cfg.greetingMs, graceMs: cfg.graceMs, farewellMs: cfg.farewellMs });
  }
  step(faces: Array<[number, number, number]>, now: number, highFiveFired = false): StateName {
    const frame: DetectionFrame = { t: now, faces: faces.map(([cx, cy, size]) => ({ cx, cy, size })), hands: [] };
    const tracks = this.tm.update(frame);
    const sel = this.sel.update(tracks, this.cfg, now);
    let target = sel.targetId !== null ? this.tm.get(sel.targetId) ?? null : null;
    let seen = target !== null && now - target.lastSeen <= this.cfg.trackTtlMs;
    if (target && seen) this.lastPos = { x: target.cx, y: target.cy };
    if (sel.targetId !== null && !seen && this.lastPos) {
      let best = null as null | typeof tracks[number];
      let d = this.cfg.reacquireDist;
      for (const t of tracks) {
        const dd = Math.hypot(t.cx - this.lastPos.x, t.cy - this.lastPos.y);
        if (dd < d) { d = dd; best = t; }
      }
      if (best) { this.sel.setTarget(best.id); target = best; seen = true; }
    }
    const targetPresent = target !== null && now - target.lastSeen <= this.cfg.trackTtlMs;
    const acquiring = sel.candidateId !== null && sel.targetId === null && sel.dwellProgress > 0;
    const s = this.fsm.update({ now, acquiring, targetPresent, highFiveFired });
    if (s.state === 'FAREWELL') { this.sel.clearTarget(); this.lastPos = null; }
    return s.state;
  }
}

const cfg: Config = { ...DEFAULT_CONFIG };
const C: [number, number, number] = [0.5, 0.5, 0.35]; // centred, in ROI

describe('scenario: empty room', () => {
  it('never greets with nobody present', () => {
    const h = new Harness(cfg);
    for (let n = 0; n <= 30000; n += 100) expect(h.step([], n)).toBe('IDLE');
  });
});

describe('scenario: acquire + engage', () => {
  it('locks the dwelling person and engages', () => {
    const h = new Harness(cfg);
    let n = 0;
    for (; n <= cfg.dwellMs; n += 50) h.step([C], n);
    // by now selected -> greeting; run greeting out
    for (; n <= cfg.dwellMs + cfg.greetingMs + 100; n += 50) h.step([C], n);
    expect(h.step([C], n)).toBe('ENGAGED');
  });
});

describe('scenario: brief occlusion within grace', () => {
  it('re-engages the same person after a short gap', () => {
    const h = new Harness(cfg);
    let n = 0;
    for (; n <= cfg.dwellMs + cfg.greetingMs + 200; n += 50) h.step([C], n);
    expect(h.fsm.current).toBe('ENGAGED');
    // occlude for less than grace
    const gapEnd = n + cfg.graceMs - 300;
    for (; n < gapEnd; n += 50) h.step([], n);
    expect(h.fsm.current).toBe('LOST_GRACE');
    // person returns near the same spot
    const st = h.step([C], n);
    expect(st).toBe('ENGAGED');
  });
});

describe('scenario: occlusion beyond grace', () => {
  it('farewells then idles', () => {
    const h = new Harness(cfg);
    let n = 0;
    for (; n <= cfg.dwellMs + cfg.greetingMs + 200; n += 50) h.step([C], n);
    // leave for longer than the grace + farewell
    let sawFarewell = false;
    const end = n + cfg.graceMs + cfg.farewellMs + 600;
    for (; n < end; n += 50) {
      const s = h.step([], n);
      if (s === 'FAREWELL') sawFarewell = true;
    }
    expect(sawFarewell).toBe(true);
    expect(h.fsm.current).toBe('IDLE');
  });
});

describe('scenario: a bigger newcomer never steals the target', () => {
  it('keeps the original target while both are present', () => {
    const h = new Harness(cfg);
    let n = 0;
    for (; n <= cfg.dwellMs + cfg.greetingMs + 200; n += 50) h.step([C], n);
    const firstId = h.sel.getTargetId();
    // a bigger newcomer appears, well separated so track ids stay distinct
    for (; n <= cfg.dwellMs + cfg.greetingMs + 3000; n += 50) h.step([C, [0.68, 0.5, 0.49]], n);
    expect(h.sel.getTargetId()).toBe(firstId);
  });
});
