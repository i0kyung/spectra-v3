import type { Config, FaceObservation, HandObservation, PoseObservation, Vec2 } from '../types';

export interface HighFiveResult {
  /** true on the single tick the gesture fires */
  fired: boolean;
  /** conditions (associated + open + raised) currently satisfied */
  met: boolean;
  /** the hand attributed to the target, if any */
  hand: HandObservation | null;
  /** ready to fire again (false during hold-after-fire / cooldown) */
  armed: boolean;
}

/**
 * Associate a hand to the target face and decide it clearly belongs to them.
 *
 * A hand is the target's only if it is within `handAssocRadius` of the target
 * face AND closer to the target than to ANY other face by `handAmbiguityMargin`.
 * If the nearest hand is ambiguous between people, we return null — we would
 * rather miss a high five than fire on a bystander's hand.
 */
export function associateHand(
  target: FaceObservation,
  otherFaces: readonly FaceObservation[],
  hands: readonly HandObservation[],
  cfg: Config,
): HandObservation | null {
  let best: HandObservation | null = null;
  let bestD = Infinity;
  for (const h of hands) {
    const d = Math.hypot(h.cx - target.cx, h.cy - target.cy);
    if (d <= cfg.handAssocRadius && d < bestD) {
      best = h;
      bestD = d;
    }
  }
  if (!best) return null;

  // Reject if another face is (nearly) as close to this hand as the target is.
  for (const f of otherFaces) {
    const dOther = Math.hypot(best.cx - f.cx, best.cy - f.cy);
    if (dOther < bestD + cfg.handAmbiguityMargin) return null;
  }
  return best;
}

function nearestWristDist(h: HandObservation, pose: PoseObservation): number {
  let d = Infinity;
  const check = (w: Vec2 | null) => {
    if (w) d = Math.min(d, Math.hypot(h.cx - w.x, h.cy - w.y));
  };
  check(pose.leftWrist);
  check(pose.rightWrist);
  return d;
}

/**
 * v2 pose fusion: attribute a hand to the target via the skeleton it belongs to.
 *
 * hand → nearest pose (by wrist) → nearest face (by torso). If that face is the
 * target, the hand is theirs. This resolves crossed-arm / reaching cases that a
 * face-distance rule gets wrong, and still rejects ambiguity (a hand whose pose
 * maps to another face returns null). Falls back to the face-distance rule when
 * no pose covers the hand.
 */
export function associateHandByPose(
  target: FaceObservation,
  otherFaces: readonly FaceObservation[],
  hands: readonly HandObservation[],
  poses: readonly PoseObservation[],
  cfg: Config,
): HandObservation | null {
  const allFaces = [target, ...otherFaces];
  for (const h of hands) {
    // hand -> pose
    let pose: PoseObservation | null = null;
    let pd = cfg.handAssocRadius;
    for (const p of poses) {
      const d = nearestWristDist(h, p);
      if (d < pd) {
        pd = d;
        pose = p;
      }
    }
    if (!pose) continue; // this hand isn't covered by a pose; try next
    // pose -> nearest face
    let owner: FaceObservation | null = null;
    let od = Infinity;
    for (const f of allFaces) {
      const d = Math.hypot(pose.cx - f.cx, pose.cy - f.cy);
      if (d < od) {
        od = d;
        owner = f;
      }
    }
    if (owner === target) return h;
  }
  // no pose-attributed hand belonged to the target
  return hands.length && poses.length ? null : associateHand(target, otherFaces, hands, cfg);
}

export class HighFive {
  private armed = true;
  private holdStart: number | null = null;
  private lastFired = -Infinity;

  reset(): void {
    this.armed = true;
    this.holdStart = null;
    this.lastFired = -Infinity;
  }

  update(
    target: FaceObservation,
    otherFaces: readonly FaceObservation[],
    hands: readonly HandObservation[],
    cfg: Config,
    now: number,
    poses?: readonly PoseObservation[],
  ): HighFiveResult {
    const hand =
      cfg.usePoseFusion && poses
        ? associateHandByPose(target, otherFaces, hands, poses, cfg)
        : associateHand(target, otherFaces, hands, cfg);
    const raised = hand !== null && hand.cy <= cfg.raiseLineY;
    const open = hand !== null && hand.openness >= cfg.palmOpenMin;
    const met = hand !== null && raised && open;

    let fired = false;

    if (met) {
      const cooled = now - this.lastFired >= cfg.highFiveCooldownMs;
      if (this.armed && cooled) {
        if (this.holdStart === null) this.holdStart = now;
        if (now - this.holdStart >= cfg.highFiveHoldMs) {
          fired = true;
          this.lastFired = now;
          this.armed = false;
          this.holdStart = null;
        }
      } else {
        // holding while disarmed/cooling — no progress
        this.holdStart = null;
      }
    } else {
      // conditions broken: reset the hold and allow re-arming once cooled down
      this.holdStart = null;
      if (!this.armed && now - this.lastFired >= cfg.highFiveCooldownMs) {
        this.armed = true;
      }
    }

    return { fired, met, hand, armed: this.armed };
  }
}
