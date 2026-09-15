import type { DetectionFrame, HandObservation, PoseObservation, SourceMode } from '../types';
import type { DetectionSource } from './source';

/**
 * Mouse/keyboard-driven synthetic input for verifying logic WITHOUT a camera.
 *
 * It emits mirrored coordinates (cx = 1 - pointerX) so that, under the same
 * mirror calibration used for a selfie camera, the character follows the
 * pointer naturally and the mapping behaves exactly as it would on camera.
 *
 * This is clearly SIMULATION mode in the UI. It never claims to be the camera.
 */
export class SimSource implements DetectionSource {
  readonly mode: SourceMode = 'simulation';
  readonly kind = 'simulation';

  private present = false;
  private nx = 0.5;
  private ny = 0.5;
  private size = 0.3;
  private raised = false;
  private open = true;
  /** an optional bystander to test multi-person / crossing logic by hand */
  private bystander: { nx: number; ny: number; size: number } | null = null;

  async start(): Promise<void> {
    /* nothing to warm up */
  }
  stop(): void {
    this.present = false;
    this.raised = false;
  }
  previewElement(): HTMLVideoElement | null {
    return null;
  }

  setPointer(nx: number, ny: number): void {
    this.nx = clamp01(nx);
    this.ny = clamp01(ny);
    this.present = true;
  }
  setPresent(p: boolean): void {
    this.present = p;
  }
  setSize(s: number): void {
    this.size = clamp01(s);
  }
  setRaised(r: boolean): void {
    this.raised = r;
  }
  setPalmOpen(o: boolean): void {
    this.open = o;
  }
  setBystander(b: { nx: number; ny: number; size: number } | null): void {
    this.bystander = b;
  }

  poll(now: number): DetectionFrame {
    const faces = [] as DetectionFrame['faces'];
    const hands: HandObservation[] = [];
    const poses: PoseObservation[] = [];
    if (this.present) {
      const cx = 1 - this.nx; // mirror, like a selfie camera
      const cy = this.ny;
      faces.push({ cx, cy, size: this.size });
      const handY = Math.min(cy - 0.22, 0.4);
      if (this.raised) {
        hands.push({ cx, cy: handY, openness: this.open ? 1 : 0.1 });
      }
      // a matching upper-body pose so pose-fusion is exercisable without a camera
      poses.push({
        cx,
        cy: cy + 0.18,
        leftWrist: this.raised ? { x: cx, y: handY } : null,
        rightWrist: null,
      });
    }
    if (this.bystander) {
      const bx = 1 - this.bystander.nx;
      faces.push({ cx: bx, cy: this.bystander.ny, size: this.bystander.size });
      poses.push({ cx: bx, cy: this.bystander.ny + 0.18, leftWrist: null, rightWrist: null });
    }
    return { t: now, captureT: now, faces, hands, poses };
  }
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
