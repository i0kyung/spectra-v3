import type { DetectionFrame, FaceObservation, Track } from '../types';

/**
 * Assigns short-lived, session-local track IDs to face observations across
 * frames using greedy nearest-neighbour matching.
 *
 * v2: matching can use a velocity-PREDICTED position and a small size-similarity
 * penalty, which reduces ID swaps when two people cross (a track is matched to
 * the observation that best continues its motion AND size, not merely the
 * nearest pixel). It is still NOT a stable person identity — after a full
 * occlusion or complete overlap the same human may get a new id (see
 * docs/UNVERIFIED.md — no biometric identity in this build).
 */
export class TrackManager {
  private tracks: Track[] = [];
  private nextId = 1;

  constructor(
    private matchDist: number,
    private ttlMs: number,
    private predict = true,
  ) {}

  setParams(matchDist: number, ttlMs: number, predict = this.predict): void {
    this.matchDist = matchDist;
    this.ttlMs = ttlMs;
    this.predict = predict;
  }

  getTracks(): readonly Track[] {
    return this.tracks;
  }

  get(id: number): Track | undefined {
    return this.tracks.find((t) => t.id === id);
  }

  reset(): void {
    this.tracks = [];
  }

  /** Drop stale tracks without ingesting a new frame. */
  expire(now: number): readonly Track[] {
    this.tracks = this.tracks.filter((tr) => now - tr.lastSeen <= this.ttlMs);
    return this.tracks;
  }

  update(frame: DetectionFrame): readonly Track[] {
    const { t, faces } = frame;

    // Candidate (track,obs) pairs gated by predicted positional distance, then
    // ranked by a blended cost (distance + size mismatch). Greedy 1:1 assign.
    const pairs: Array<{ ti: number; oi: number; cost: number }> = [];
    for (let ti = 0; ti < this.tracks.length; ti++) {
      const tr = this.tracks[ti];
      const px = this.predictedPos(tr, t);
      for (let oi = 0; oi < faces.length; oi++) {
        const f = faces[oi];
        const d = Math.hypot(px.x - f.cx, px.y - f.cy);
        if (d > this.matchDist) continue;
        const sizePenalty = Math.abs(tr.size - f.size) * 0.5;
        pairs.push({ ti, oi, cost: d + sizePenalty });
      }
    }
    pairs.sort((a, b) => a.cost - b.cost);

    const trackUsed = new Set<number>();
    const obsUsed = new Set<number>();
    for (const p of pairs) {
      if (trackUsed.has(p.ti) || obsUsed.has(p.oi)) continue;
      trackUsed.add(p.ti);
      obsUsed.add(p.oi);
      this.matchTrack(this.tracks[p.ti], faces[p.oi], t);
    }

    for (let oi = 0; oi < faces.length; oi++) {
      if (obsUsed.has(oi)) continue;
      const f = faces[oi];
      this.tracks.push({
        id: this.nextId++,
        cx: f.cx,
        cy: f.cy,
        size: f.size,
        vx: 0,
        vy: 0,
        lastSeen: t,
        firstSeen: t,
        confidence: 0.2,
        hits: 1,
      });
    }

    this.tracks = this.tracks.filter((tr) => t - tr.lastSeen <= this.ttlMs);
    return this.tracks;
  }

  private predictedPos(tr: Track, t: number): { x: number; y: number } {
    if (!this.predict) return { x: tr.cx, y: tr.cy };
    const dt = Math.min(0.2, Math.max(0, (t - tr.lastSeen) / 1000)); // cap 200ms
    return { x: tr.cx + tr.vx * dt, y: tr.cy + tr.vy * dt };
  }

  private matchTrack(tr: Track, f: FaceObservation, t: number): void {
    const dt = Math.max(1, t - tr.lastSeen) / 1000;
    const nvx = (f.cx - tr.cx) / dt;
    const nvy = (f.cy - tr.cy) / dt;
    tr.vx = tr.vx * 0.6 + nvx * 0.4;
    tr.vy = tr.vy * 0.6 + nvy * 0.4;
    tr.cx = f.cx;
    tr.cy = f.cy;
    tr.size = tr.size * 0.5 + f.size * 0.5;
    tr.lastSeen = t;
    tr.hits++;
    tr.confidence = Math.min(1, tr.confidence + 0.12);
  }
}
