import { describe, it, expect } from 'vitest';
import { TrackManager } from '../src/core/trackManager';
import type { DetectionFrame } from '../src/types';

const frame = (t: number, faces: Array<[number, number, number]>): DetectionFrame => ({
  t,
  faces: faces.map(([cx, cy, size]) => ({ cx, cy, size })),
  hands: [],
});

describe('TrackManager', () => {
  it('keeps one id for a face moving smoothly', () => {
    const tm = new TrackManager(0.16, 500);
    tm.update(frame(0, [[0.4, 0.5, 0.3]]));
    tm.update(frame(50, [[0.42, 0.5, 0.3]]));
    const tracks = tm.update(frame(100, [[0.44, 0.5, 0.3]]));
    expect(tracks.length).toBe(1);
    expect(tracks[0].hits).toBe(3);
  });

  it('assigns a separate id to a distinct new face', () => {
    const tm = new TrackManager(0.16, 500);
    tm.update(frame(0, [[0.3, 0.5, 0.3]]));
    const tracks = tm.update(frame(50, [[0.3, 0.5, 0.3], [0.8, 0.5, 0.3]]));
    expect(tracks.length).toBe(2);
    expect(new Set(tracks.map((t) => t.id)).size).toBe(2);
  });

  it('expires a track after its TTL', () => {
    const tm = new TrackManager(0.16, 500);
    tm.update(frame(0, [[0.5, 0.5, 0.3]]));
    expect(tm.getTracks().length).toBe(1);
    expect(tm.expire(600).length).toBe(0);
  });

  it('holds two ids through a slow separation (no id collapse)', () => {
    const tm = new TrackManager(0.16, 500);
    tm.update(frame(0, [[0.45, 0.5, 0.3], [0.55, 0.5, 0.3]]));
    const t2 = tm.update(frame(60, [[0.4, 0.5, 0.3], [0.6, 0.5, 0.3]]));
    expect(t2.length).toBe(2);
  });

  it('v2: velocity prediction keeps the id across a fast jump that plain NN would drop', () => {
    // establish velocity, then a jump larger than matchDist from the last position
    const withPredict = new TrackManager(0.16, 500, true);
    withPredict.update(frame(0, [[0.2, 0.5, 0.3]]));
    withPredict.update(frame(100, [[0.32, 0.5, 0.3]])); // v ~ +1.2/s
    const p = withPredict.update(frame(200, [[0.5, 0.5, 0.3]])); // 0.18 jump > 0.16
    expect(p.length).toBe(1); // matched via predicted position

    const noPredict = new TrackManager(0.16, 500, false);
    noPredict.update(frame(0, [[0.2, 0.5, 0.3]]));
    noPredict.update(frame(100, [[0.32, 0.5, 0.3]]));
    const n = noPredict.update(frame(200, [[0.5, 0.5, 0.3]]));
    expect(n.length).toBe(2); // plain NN can't bridge the jump -> spawns a new id
  });
});
