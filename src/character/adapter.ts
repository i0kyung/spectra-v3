import type { Expression, GestureName, ProximityBand, Vec2 } from '../types';

/**
 * The seam that lets us swap rendering back-ends. The sprite adapter drives the
 * reused PNG art today; a Live2D adapter can replace it later WITHOUT touching
 * any perception / state logic, as long as it honours this same contract.
 */
export interface CharacterAdapter {
  /** operator-facing name of the rendering back-end */
  readonly name: string;
  /** true if this is the code-drawn verification character (must be labelled) */
  readonly isDebug: boolean;

  mount(container: HTMLElement): Promise<void>;

  /** aim head/body toward v (each axis in [-1,1]; +x = character's right, +y = down) */
  lookAt(v: Vec2): void;
  setExpression(e: Expression): void;
  playGesture(g: GestureName): void;
  /** optional relative-closeness cue (lean / scale) */
  setProximity(band: ProximityBand): void;
  setSignatureColor(color: string): void;

  /** advance animation and render one frame */
  update(dtMs: number, now: number): void;
  dispose(): void;
}
