import { describe, it, expect } from 'vitest';
import { TargetSelector } from '../src/core/targetSelector';
import { DEFAULT_CONFIG } from '../src/config';
import type { Config, Track } from '../src/types';

const cfg: Config = { ...DEFAULT_CONFIG, dwellMs: 700 };

const mk = (id: number, cx: number, cy: number, size: number, conf = 1): Track => ({
  id, cx, cy, size, vx: 0, vy: 0, lastSeen: 0, firstSeen: 0, confidence: conf, hits: 10,
});

describe('TargetSelector', () => {
  it('ignores candidates outside the ROI', () => {
    const sel = new TargetSelector();
    const outside = [mk(1, 0.02, 0.02, 0.3)]; // ROI default starts at x=0.2,y=0.1
    for (let n = 0; n <= 2000; n += 100) {
      expect(sel.update(outside, cfg, n).targetId).toBeNull();
    }
  });

  it('selects an in-ROI candidate only after the dwell time', () => {
    const sel = new TargetSelector();
    const cand = [mk(1, 0.5, 0.5, 0.3)];
    expect(sel.update(cand, cfg, 0).targetId).toBeNull();
    expect(sel.update(cand, cfg, cfg.dwellMs - 1).targetId).toBeNull();
    expect(sel.update(cand, cfg, cfg.dwellMs).targetId).toBe(1);
  });

  it('does NOT let a bigger/closer newcomer steal a locked target', () => {
    const sel = new TargetSelector();
    const cand = [mk(1, 0.5, 0.5, 0.3)];
    sel.update(cand, cfg, 0);
    sel.update(cand, cfg, cfg.dwellMs); // locked on id 1
    const withNewcomer = [mk(1, 0.5, 0.5, 0.3), mk(2, 0.5, 0.5, 0.49)]; // id 2 much bigger + centred
    for (let n = cfg.dwellMs; n <= cfg.dwellMs + 3000; n += 100) {
      expect(sel.update(withNewcomer, cfg, n).targetId).toBe(1);
    }
  });

  it('requires a fresh dwell after clearTarget', () => {
    const sel = new TargetSelector();
    const cand = [mk(1, 0.5, 0.5, 0.3)];
    sel.update(cand, cfg, 0);
    sel.update(cand, cfg, cfg.dwellMs);
    sel.clearTarget();
    expect(sel.update(cand, cfg, cfg.dwellMs).targetId).toBeNull();
    expect(sel.update(cand, cfg, cfg.dwellMs * 2).targetId).toBe(1);
  });

  it('does not select a low-confidence one-frame ghost', () => {
    const sel = new TargetSelector();
    const ghost = [mk(9, 0.5, 0.5, 0.3, 0.2)];
    expect(sel.update(ghost, cfg, 0).targetId).toBeNull();
    expect(sel.update(ghost, cfg, cfg.dwellMs + 500).targetId).toBeNull();
  });
});
