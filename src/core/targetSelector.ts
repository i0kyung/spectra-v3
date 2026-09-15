import type { Config, Roi, Track } from '../types';

export interface SelectionView {
  targetId: number | null;
  candidateId: number | null;
  /** 0..1 dwell progress toward selection for the current candidate */
  dwellProgress: number;
}

function inRoi(t: Track, r: Roi): boolean {
  return t.cx >= r.x && t.cx <= r.x + r.w && t.cy >= r.y && t.cy <= r.y + r.h;
}

/** Higher = better candidate. Centre-nearness (within ROI) blended with size. */
function score(t: Track, r: Roi, centerWeight: number): number {
  const rcx = r.x + r.w / 2;
  const rcy = r.y + r.h / 2;
  const dx = (t.cx - rcx) / (r.w / 2 || 1);
  const dy = (t.cy - rcy) / (r.h / 2 || 1);
  const centerness = 1 - Math.min(1, Math.hypot(dx, dy)); // 1 at centre
  const sizeNorm = Math.min(1, t.size / 0.5);
  return centerWeight * centerness + (1 - centerWeight) * sizeNorm;
}

/**
 * Selects at most one target. Once a target is locked it is NOT stolen by a
 * bigger/closer face — the caller clears it (via clearTarget) only when the
 * target is truly lost past its grace window.
 */
export class TargetSelector {
  private targetId: number | null = null;
  private candidateId: number | null = null;
  private candidateSince = 0;

  clearTarget(): void {
    this.targetId = null;
    this.candidateId = null;
    this.candidateSince = 0;
  }

  /** Force a specific existing track to be the target (used on re-acquire). */
  setTarget(id: number): void {
    this.targetId = id;
    this.candidateId = null;
    this.candidateSince = 0;
  }

  getTargetId(): number | null {
    return this.targetId;
  }

  update(tracks: readonly Track[], cfg: Config, now: number): SelectionView {
    // If we still hold a valid, present target, keep it (hysteresis).
    if (this.targetId !== null && tracks.some((t) => t.id === this.targetId)) {
      return { targetId: this.targetId, candidateId: null, dwellProgress: 1 };
    }
    // Target vanished from the track list — let the caller's grace logic decide.
    // We do NOT auto-clear here; caller calls clearTarget() when grace expires.
    if (this.targetId !== null) {
      return { targetId: this.targetId, candidateId: null, dwellProgress: 1 };
    }

    // No target: rank in-ROI candidates and require a stable dwell.
    const candidates = tracks.filter((t) => inRoi(t, cfg.roi));
    if (candidates.length === 0) {
      this.candidateId = null;
      this.candidateSince = 0;
      return { targetId: null, candidateId: null, dwellProgress: 0 };
    }

    let best = candidates[0];
    let bestScore = score(best, cfg.roi, cfg.centerWeight);
    for (const c of candidates.slice(1)) {
      const s = score(c, cfg.roi, cfg.centerWeight);
      if (s > bestScore) {
        best = c;
        bestScore = s;
      }
    }

    if (this.candidateId !== best.id) {
      this.candidateId = best.id;
      this.candidateSince = now;
    }
    const dwell = now - this.candidateSince;
    const progress = Math.min(1, dwell / cfg.dwellMs);

    // Require both dwell AND minimal confidence so a one-frame ghost can't win.
    if (dwell >= cfg.dwellMs && best.confidence >= 0.4) {
      this.targetId = best.id;
      return { targetId: best.id, candidateId: best.id, dwellProgress: 1 };
    }
    return { targetId: null, candidateId: best.id, dwellProgress: progress };
  }
}
