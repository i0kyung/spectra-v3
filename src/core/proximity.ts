import type { Config, ProximityBand } from '../types';

/**
 * Relative near/far from face size with separate enter/exit thresholds so the
 * band does not flicker at the boundary. This is a RELATIVE closeness cue, not
 * a distance in metres — never surface it as a metric distance.
 */
export class Proximity {
  private band: ProximityBand = 'far';

  get value(): ProximityBand {
    return this.band;
  }

  reset(): void {
    this.band = 'far';
  }

  update(size: number, cfg: Config): ProximityBand {
    if (this.band === 'far' && size >= cfg.nearEnter) this.band = 'near';
    else if (this.band === 'near' && size <= cfg.nearExit) this.band = 'far';
    return this.band;
  }

  /** 0..1 continuous fill for the operator meter (not a distance). */
  static level(size: number, cfg: Config): number {
    const hi = Math.max(cfg.nearEnter * 1.3, 0.01);
    return Math.min(1, Math.max(0, size / hi));
  }
}
