import { describe, it, expect } from 'vitest';
import { associateHandByPose } from '../src/core/highfive';
import { DEFAULT_CONFIG } from '../src/config';
import type { Config, FaceObservation, HandObservation, PoseObservation } from '../src/types';

const cfg: Config = { ...DEFAULT_CONFIG, usePoseFusion: true };
const target: FaceObservation = { cx: 0.4, cy: 0.5, size: 0.34 };
const other: FaceObservation = { cx: 0.7, cy: 0.5, size: 0.33 };
// a hand sitting BETWEEN the two faces — face-distance alone would be ambiguous
const midHand: HandObservation = { cx: 0.55, cy: 0.3, openness: 1 };

describe('associateHandByPose (v2 pose fusion)', () => {
  it("attributes the hand via the skeleton it belongs to (target's arm reaching)", () => {
    const poses: PoseObservation[] = [
      { cx: 0.4, cy: 0.68, leftWrist: { x: 0.55, y: 0.3 }, rightWrist: null }, // target's arm reaches to mid
      { cx: 0.7, cy: 0.68, leftWrist: null, rightWrist: null },
    ];
    expect(associateHandByPose(target, [other], [midHand], poses, cfg)).toBe(midHand);
  });

  it('rejects the hand when the owning skeleton maps to another person', () => {
    const poses: PoseObservation[] = [
      { cx: 0.4, cy: 0.68, leftWrist: null, rightWrist: null },
      { cx: 0.7, cy: 0.68, leftWrist: { x: 0.55, y: 0.3 }, rightWrist: null }, // bystander's arm reaches to mid
    ];
    expect(associateHandByPose(target, [other], [midHand], poses, cfg)).toBeNull();
  });

  it('falls back to the distance rule when no pose is available', () => {
    const near: HandObservation = { cx: 0.4, cy: 0.3, openness: 1 };
    expect(associateHandByPose(target, [other], [near], [], cfg)).toBe(near);
  });
});
