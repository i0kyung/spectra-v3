import type { FaceObservation, HandObservation, PoseObservation, Vec2 } from '../types';

export interface NL {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
}

/** Face bbox (center + height fraction) from a MediaPipe face-landmark set. */
export function faceFromLandmarks(lm: readonly NL[]): FaceObservation {
  let minX = 1,
    minY = 1,
    maxX = 0,
    maxY = 0;
  for (const p of lm) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return {
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
    size: Math.max(0, maxY - minY),
  };
}

// MediaPipe hand landmark indices
const WRIST = 0;
const MIDDLE_MCP = 9;
const FINGERS: Array<{ tip: number; pip: number }> = [
  { tip: 8, pip: 6 }, // index
  { tip: 12, pip: 10 }, // middle
  { tip: 16, pip: 14 }, // ring
  { tip: 20, pip: 18 }, // pinky
];

function d(a: NL, b: NL): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Palm center + openness from a hand-landmark set.
 * openness = fraction of the 4 non-thumb fingers whose tip is farther from the
 * wrist than its PIP joint (i.e. extended). Robust to scale and rotation and
 * avoids over-claiming a precise finger pose.
 */
export function handFromLandmarks(lm: readonly NL[]): HandObservation {
  const wrist = lm[WRIST];
  const mmcp = lm[MIDDLE_MCP];
  let extended = 0;
  for (const f of FINGERS) {
    if (d(lm[f.tip], wrist) > d(lm[f.pip], wrist) * 1.05) extended++;
  }
  return {
    cx: (wrist.x + mmcp.x) / 2,
    cy: (wrist.y + mmcp.y) / 2,
    openness: extended / FINGERS.length,
  };
}

// MediaPipe pose landmark indices
const L_SHOULDER = 11;
const R_SHOULDER = 12;
const L_WRIST = 15;
const R_WRIST = 16;
const VIS_MIN = 0.5;

function visible(p: NL | undefined): Vec2 | null {
  if (!p) return null;
  if (p.visibility !== undefined && p.visibility < VIS_MIN) return null;
  return { x: p.x, y: p.y };
}

/** Upper-body pose (torso anchor + wrists) from a MediaPipe pose-landmark set. */
export function poseFromLandmarks(lm: readonly NL[]): PoseObservation {
  const ls = lm[L_SHOULDER];
  const rs = lm[R_SHOULDER];
  return {
    cx: ((ls?.x ?? 0.5) + (rs?.x ?? 0.5)) / 2,
    cy: ((ls?.y ?? 0.5) + (rs?.y ?? 0.5)) / 2,
    leftWrist: visible(lm[L_WRIST]),
    rightWrist: visible(lm[R_WRIST]),
  };
}
