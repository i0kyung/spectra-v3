import { describe, it, expect } from 'vitest';
import { HighFive, associateHand } from '../src/core/highfive';
import { DEFAULT_CONFIG } from '../src/config';
import type { Config, FaceObservation, HandObservation } from '../src/types';

const cfg: Config = { ...DEFAULT_CONFIG };
const target: FaceObservation = { cx: 0.5, cy: 0.5, size: 0.35 };
const openRaised = (cx: number): HandObservation => ({ cx, cy: 0.3, openness: 1 });

describe('associateHand', () => {
  it("returns the target's own raised open hand", () => {
    const h = associateHand(target, [], [openRaised(0.5)], cfg);
    expect(h).not.toBeNull();
  });

  it("rejects a bystander's hand that is ambiguous between two faces", () => {
    const other: FaceObservation = { cx: 0.72, cy: 0.5, size: 0.33 };
    // hand sits between the two faces -> ambiguous -> must be rejected
    const hand = openRaised(0.61);
    expect(associateHand(target, [other], [hand], cfg)).toBeNull();
  });

  it('rejects a hand that is too far from the target', () => {
    // a corner hand, beyond handAssocRadius from the centred target
    expect(associateHand(target, [], [{ cx: 0.99, cy: 0.99, openness: 1 }], cfg)).toBeNull();
  });
});

describe('HighFive', () => {
  it('fires once after the hold, then suppresses repeats while held', () => {
    const hf = new HighFive();
    let fires = 0;
    for (let n = 0; n <= 3000; n += 50) {
      const r = hf.update(target, [], [openRaised(0.5)], cfg, n);
      if (r.fired) fires++;
    }
    expect(fires).toBe(1); // held continuously -> single fire
  });

  it('re-fires only after the hand is lowered and the cooldown passes', () => {
    const hf = new HighFive();
    const fireTimes: number[] = [];
    let n = 0;
    // hold up until first fire
    for (; n <= 1000; n += 50) if (hf.update(target, [], [openRaised(0.5)], cfg, n).fired) fireTimes.push(n);
    // lower the hand past the cooldown
    for (; n <= 1000 + cfg.highFiveCooldownMs + 200; n += 50) hf.update(target, [], [], cfg, n);
    // raise again
    for (; n <= 1000 + cfg.highFiveCooldownMs + 1500; n += 50)
      if (hf.update(target, [], [openRaised(0.5)], cfg, n).fired) fireTimes.push(n);
    expect(fireTimes.length).toBe(2);
  });

  it('does not fire on a closed (non-open) hand', () => {
    const hf = new HighFive();
    let fired = false;
    for (let n = 0; n <= 2000; n += 50) {
      if (hf.update(target, [], [{ cx: 0.5, cy: 0.3, openness: 0.2 }], cfg, n).fired) fired = true;
    }
    expect(fired).toBe(false);
  });

  it("does not fire on a bystander's hand", () => {
    const hf = new HighFive();
    const other: FaceObservation = { cx: 0.72, cy: 0.5, size: 0.33 };
    let fired = false;
    for (let n = 0; n <= 2000; n += 50) {
      if (hf.update(target, [other], [openRaised(0.61)], cfg, n).fired) fired = true;
    }
    expect(fired).toBe(false);
  });
});
