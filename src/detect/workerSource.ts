import type { DetectionFrame, FaceObservation, HandObservation, PoseObservation, SourceMode } from '../types';
import { CameraError, type CameraErrorKind, type DetectionSource, type SourceStats } from './source';
import { openCamera } from './camera';

export interface WorkerOptions {
  maxFaces?: number;
  maxHands?: number;
  usePoseFusion?: boolean;
  onError?: (kind: CameraErrorKind, message: string) => void;
}

// Absolute base URL (ends with '/'), so paths sent to the worker resolve against
// the site root, not the worker's own module URL — required on GitHub Pages sub-paths.
const base = new URL(import.meta.env.BASE_URL, location.href).href;

interface ResultMsg {
  type: 'result';
  faces: FaceObservation[];
  hands: HandObservation[];
  poses: PoseObservation[] | null;
  captureT: number;
  doneT: number;
}

/** Camera source that offloads all landmark inference to a Web Worker. */
export class WorkerSource implements DetectionSource {
  readonly mode: SourceMode = 'camera';
  readonly kind = 'mediapipe';

  private video: HTMLVideoElement | null = null;
  private stream: MediaStream | null = null;
  private worker: Worker | null = null;
  private running = false;
  private inflight = false;
  private lastVideoTime = -1;
  private latest: DetectionFrame | null = null;
  private serial = 0;
  private lastReturned = -1;
  private detectMs = 0;
  private wantPose: boolean;

  constructor(private opts: WorkerOptions = {}) {
    this.wantPose = !!opts.usePoseFusion;
  }

  static supported(): boolean {
    return typeof Worker !== 'undefined' && typeof createImageBitmap === 'function';
  }

  previewElement(): HTMLVideoElement | null {
    return this.video;
  }

  stats(): SourceStats {
    return { detectMs: this.detectMs, inflight: this.inflight, detail: 'worker' };
  }

  setPoseFusion(enable: boolean): void {
    this.wantPose = enable;
    this.worker?.postMessage({ type: 'setPose', enable });
  }

  async start(): Promise<void> {
    const cam = await openCamera();
    this.stream = cam.stream;
    this.video = cam.video;

    const track = this.stream.getVideoTracks()[0];
    track?.addEventListener('ended', () => {
      this.opts.onError?.('disconnected', '카메라 연결이 끊겼습니다. 다시 연결한 뒤 재시작하세요.');
      this.stop();
    });

    // Spin up the module worker and wait for it to load the models.
    this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    await new Promise<void>((resolve, reject) => {
      const w = this.worker!;
      const onReady = (e: MessageEvent) => {
        if (e.data?.type === 'ready') {
          w.removeEventListener('message', onReady);
          resolve();
        } else if (e.data?.type === 'error') {
          w.removeEventListener('message', onReady);
          reject(new CameraError('unknown', '워커 초기화 실패: ' + e.data.message));
        }
      };
      w.addEventListener('message', onReady);
      w.postMessage({
        type: 'init',
        wasmBase: base + 'wasm',
        faceModel: base + 'models/face_landmarker.task',
        handModel: base + 'models/hand_landmarker.task',
        poseModel: base + 'models/pose_landmarker_lite.task',
        maxFaces: this.opts.maxFaces ?? 4,
        maxHands: this.opts.maxHands ?? 4,
        wantPose: this.wantPose,
      });
    });

    this.worker.addEventListener('message', (e: MessageEvent<ResultMsg | { type: string; message?: string }>) => {
      const m = e.data as ResultMsg;
      if (m.type === 'result') {
        this.inflight = false;
        this.detectMs = Math.max(0, m.doneT - m.captureT);
        this.serial++;
        this.latest = {
          t: m.doneT,
          captureT: m.captureT,
          faces: m.faces,
          hands: m.hands,
          poses: m.poses ?? undefined,
        };
      }
    });

    this.running = true;
  }

  poll(now: number): DetectionFrame | null {
    if (!this.running || !this.video || !this.worker) return null;

    // Submit a new frame if the worker is idle and the camera advanced.
    if (!this.inflight && this.video.readyState >= 2 && this.video.currentTime !== this.lastVideoTime) {
      this.lastVideoTime = this.video.currentTime;
      this.inflight = true;
      const captureT = now;
      createImageBitmap(this.video)
        .then((bitmap) => {
          if (!this.worker || !this.running) {
            bitmap.close();
            this.inflight = false;
            return;
          }
          this.worker.postMessage({ type: 'frame', bitmap, captureT, wantPose: this.wantPose }, [bitmap]);
        })
        .catch(() => {
          this.inflight = false;
        });
    }

    // Return the latest completed detection once.
    if (this.latest && this.serial !== this.lastReturned) {
      this.lastReturned = this.serial;
      return this.latest;
    }
    return null;
  }

  stop(): void {
    this.running = false;
    this.inflight = false;
    if (this.stream) for (const t of this.stream.getTracks()) t.stop();
    this.stream = null;
    this.worker?.terminate();
    this.worker = null;
    if (this.video) {
      this.video.srcObject = null;
      this.video = null;
    }
    this.lastVideoTime = -1;
    this.latest = null;
  }
}
