import type { DetectionFrame, FaceObservation, HandObservation, PoseObservation, SourceMode } from '../types';
import type { DetectionSource, SourceStats } from './source';

export type ScenarioName = 'empty' | 'engage' | 'cross' | 'bystanderHand' | 'occlusion' | 'spamHand';

export const SCENARIOS: Array<{ id: ScenarioName; label: string }> = [
  { id: 'empty', label: '무인 (오작동 없음)' },
  { id: 'engage', label: '입장 → 바라봄 → 하이파이브' },
  { id: 'cross', label: '2인 교차' },
  { id: 'bystanderHand', label: '타인 손 (무발동)' },
  { id: 'occlusion', label: '가림 후 복귀' },
  { id: 'spamHand', label: '하이파이브 연타' },
];

type Script = (tMs: number) => { faces: FaceObservation[]; hands: HandObservation[]; poses: PoseObservation[] };

const face = (cx: number, cy: number, size = 0.32): FaceObservation => ({ cx, cy, size });
const openHand = (cx: number): HandObservation => ({ cx, cy: 0.28, openness: 1 });
const pose = (cx: number, cy: number, wristUp: boolean): PoseObservation => ({
  cx,
  cy: cy + 0.18,
  leftWrist: wristUp ? { x: cx, y: 0.28 } : null,
  rightWrist: null,
});

const SCRIPTS: Record<ScenarioName, Script> = {
  empty: () => ({ faces: [], hands: [], poses: [] }),

  engage: (t) => {
    const p = 0.5;
    const cyc = t % 8000;
    const raise = cyc > 3000 && cyc < 3700; // brief open-hand raise -> single fire
    return {
      faces: [face(p, 0.5)],
      hands: raise ? [openHand(p)] : [],
      poses: [pose(p, 0.5, raise)],
    };
  },

  cross: (t) => {
    const u = (t % 5000) / 5000; // 0..1
    const a = 0.3 + u * 0.4; // left->right
    const b = 0.7 - u * 0.4; // right->left
    return {
      faces: [face(a, 0.5, 0.32), face(b, 0.52, 0.3)],
      hands: [],
      poses: [pose(a, 0.5, false), pose(b, 0.52, false)],
    };
  },

  bystanderHand: (t) => {
    const target = 0.42;
    const other = 0.66;
    const cyc = t % 6000;
    const otherRaises = cyc > 2500 && cyc < 3500; // bystander raises -> must NOT fire
    return {
      faces: [face(target, 0.5), face(other, 0.5)],
      hands: otherRaises ? [openHand(other)] : [],
      poses: [pose(target, 0.5, false), pose(other, 0.5, otherRaises)],
    };
  },

  occlusion: (t) => {
    const cyc = t % 7000;
    const gone = cyc > 3500 && cyc < 4600; // ~1.1s gap (< grace)
    return gone
      ? { faces: [], hands: [], poses: [] }
      : { faces: [face(0.5, 0.5)], hands: [], poses: [pose(0.5, 0.5, false)] };
  },

  spamHand: (t) => {
    const p = 0.5;
    const cyc = t % 2000;
    const raise = cyc < 900; // up ~0.9s, down ~1.1s, repeat -> fire once per raise
    return {
      faces: [face(p, 0.5)],
      hands: raise ? [openHand(p)] : [],
      poses: [pose(p, 0.5, raise)],
    };
  },
};

/**
 * Plays a scripted synthetic timeline into the engine for demos/verification.
 * It is SIMULATION mode and labels itself as a scenario — it never claims to be
 * the real camera.
 */
export class ScenarioSource implements DetectionSource {
  readonly mode: SourceMode = 'simulation';
  readonly kind = 'scenario';
  private startT = 0;
  private name: ScenarioName;

  constructor(name: ScenarioName = 'engage') {
    this.name = name;
  }

  setScenario(name: ScenarioName): void {
    this.name = name;
    this.startT = performance.now();
  }

  async start(): Promise<void> {
    this.startT = performance.now();
  }
  stop(): void {}
  previewElement(): HTMLVideoElement | null {
    return null;
  }
  stats(): SourceStats {
    return { detectMs: 0, inflight: false, detail: 'scenario:' + this.name };
  }

  poll(now: number): DetectionFrame {
    const d = SCRIPTS[this.name](now - this.startT);
    return { t: now, captureT: now, faces: d.faces, hands: d.hands, poses: d.poses };
  }
}
