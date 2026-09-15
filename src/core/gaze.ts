import type { Config, Vec2 } from '../types';

/**
 * Maps a target face position to a smoothed look vector in [-1,1] per axis,
 * where +x = character aims to ITS right (display right), +y = downward.
 *
 * This is a coarse head/body AIM derived from face POSITION. It is NOT a
 * measurement of the viewer's eyeball gaze and must not be described as one.
 */
export class Gaze {
  private cur: Vec2 = { x: 0, y: 0 };

  get value(): Vec2 {
    return { ...this.cur };
  }

  reset(): void {
    this.cur = { x: 0, y: 0 };
  }

  /** Compute the raw (unsmoothed) target aim from a face centre. */
  static rawAim(cx: number, cy: number, cfg: Config): Vec2 {
    let rx = (cx - 0.5) * 2;
    let ry = (cy - 0.5) * 2;
    if (cfg.flipX) rx = -rx;
    if (cfg.flipY) ry = -ry;
    rx = clamp(rx * cfg.gazeGain, -cfg.gazeMaxX, cfg.gazeMaxX);
    ry = clamp(ry * cfg.gazeGain, -cfg.gazeMaxY, cfg.gazeMaxY);
    return { x: rx, y: ry };
  }

  /** Advance smoothing toward the aim for a face centre. dtMs must be > 0. */
  update(cx: number, cy: number, cfg: Config, dtMs: number): Vec2 {
    const aim = Gaze.rawAim(cx, cy, cfg);
    return this.approach(aim, cfg, dtMs);
  }

  /** Ease the look vector back to centre (no target). */
  center(cfg: Config, dtMs: number): Vec2 {
    return this.approach({ x: 0, y: 0 }, cfg, dtMs);
  }

  private approach(aim: Vec2, cfg: Config, dtMs: number): Vec2 {
    // Deadzone: ignore sub-threshold changes to suppress shimmer.
    const dz = cfg.gazeDeadzone;
    const tx = Math.abs(aim.x - this.cur.x) < dz ? this.cur.x : aim.x;
    const ty = Math.abs(aim.y - this.cur.y) < dz ? this.cur.y : aim.y;

    // Time-based exponential smoothing: frame-rate independent.
    const tau = Math.max(1, cfg.gazeSmoothMs);
    const alpha = 1 - Math.exp(-dtMs / tau);
    this.cur.x += (tx - this.cur.x) * alpha;
    this.cur.y += (ty - this.cur.y) * alpha;
    return { ...this.cur };
  }
}

function clamp(v: number, a: number, b: number): number {
  return v < a ? a : v > b ? b : v;
}
