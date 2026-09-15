import type { CharacterAdapter } from './adapter';
import type { Expression, GestureName, ProximityBand, Vec2 } from '../types';

/**
 * Placeholder for a future Live2D Cubism back-end. It is intentionally NOT
 * functional: no .model3.json / .moc3 / textures / motions were provided, so
 * there is nothing to load. Wiring the real SDK is only meaningful once the
 * files listed in REQUIRED_FILES exist. See docs/LIVE2D_CHECKLIST.md.
 */
export const REQUIRED_FILES = [
  'model/<name>.model3.json',
  'model/<name>.moc3',
  'model/textures/texture_00.png (…)',
  'model/<name>.physics3.json (권장)',
  'motions/greeting.motion3.json',
  'motions/highfive.motion3.json',
  'parameters: ParamAngleX/Y/Z, ParamEyeBallX/Y, ParamBodyAngleX, ParamMouthOpenY, expression 파라미터',
] as const;

export class Live2DAdapter implements CharacterAdapter {
  readonly name = 'Live2D (미제공 — 파일 필요)';
  readonly isDebug = false;

  async mount(): Promise<void> {
    throw new Error(
      'Live2D 어댑터는 아직 사용할 수 없습니다. 다음 파일이 필요합니다:\n- ' +
        REQUIRED_FILES.join('\n- '),
    );
  }
  lookAt(_v: Vec2): void {}
  setExpression(_e: Expression): void {}
  playGesture(_g: GestureName): void {}
  setProximity(_b: ProximityBand): void {}
  setSignatureColor(_c: string): void {}
  update(_dt: number, _now: number): void {}
  dispose(): void {}
}
