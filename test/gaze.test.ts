import { describe, it, expect } from 'vitest';
import { Gaze } from '../src/core/gaze';
import { DEFAULT_CONFIG } from '../src/config';
import type { Config } from '../src/types';

describe('Gaze.rawAim mapping', () => {
  it('mirrors horizontally when flipX is on (selfie default)', () => {
    const cfg: Config = { ...DEFAULT_CONFIG, flipX: true, gazeGain: 1 };
    expect(Gaze.rawAim(0.8, 0.5, cfg).x).toBeLessThan(0); // person on right -> look left of frame
    expect(Gaze.rawAim(0.2, 0.5, cfg).x).toBeGreaterThan(0);
  });

  it('does not mirror when flipX is off', () => {
    const cfg: Config = { ...DEFAULT_CONFIG, flipX: false, gazeGain: 1 };
    expect(Gaze.rawAim(0.8, 0.5, cfg).x).toBeGreaterThan(0);
  });

  it('clamps to the configured max on both axes (boundary values)', () => {
    const cfg: Config = { ...DEFAULT_CONFIG, flipX: false, gazeGain: 5, gazeMaxX: 1, gazeMaxY: 0.7 };
    expect(Gaze.rawAim(1, 1, cfg)).toEqual({ x: 1, y: 0.7 });
    expect(Gaze.rawAim(0, 0, cfg)).toEqual({ x: -1, y: -0.7 });
  });

  it('centre maps to zero', () => {
    const v = Gaze.rawAim(0.5, 0.5, DEFAULT_CONFIG);
    expect(v.x).toBeCloseTo(0);
    expect(v.y).toBeCloseTo(0);
  });
});

describe('Gaze smoothing', () => {
  it('converges toward the aim and is frame-rate independent-ish', () => {
    const cfg: Config = { ...DEFAULT_CONFIG, flipX: false, gazeGain: 1, gazeSmoothMs: 100, gazeDeadzone: 0 };
    const g = new Gaze();
    let last = 0;
    for (let i = 0; i < 60; i++) last = g.update(0.9, 0.5, cfg, 16).x;
    const aim = Gaze.rawAim(0.9, 0.5, cfg).x;
    expect(Math.abs(last - aim)).toBeLessThan(0.02);
  });

  it('deadzone suppresses sub-threshold jitter', () => {
    const cfg: Config = { ...DEFAULT_CONFIG, flipX: false, gazeGain: 1, gazeDeadzone: 0.2, gazeSmoothMs: 50 };
    const g = new Gaze();
    // a tiny offset within the deadzone should not move the output off zero
    const v = g.update(0.55, 0.5, cfg, 16);
    expect(v.x).toBe(0);
  });
});
