import { FilesetResolver, FaceLandmarker, HandLandmarker, PoseLandmarker } from '@mediapipe/tasks-vision';
import type { DetectionFrame, SourceMode } from '../types';
import { type CameraErrorKind, type DetectionSource, type SourceStats } from './source';
import { faceFromLandmarks, handFromLandmarks, poseFromLandmarks } from './landmarks';
import { openCamera } from './camera';

export interface MediapipeOptions {
  maxFaces?: number;
  maxHands?: number;
  usePoseFusion?: boolean;
  onError?: (kind: CameraErrorKind, message: string) => void;
}

// Absolute base URL so model/WASM paths resolve against the site root on any sub-path.
const base = new URL(import.meta.env.BASE_URL, location.href).href;

/**
 * Main-thread MediaPipe source — the compatibility fallback when Web Workers or
 * ImageBitmap aren't available. Inference and render are still decoupled: it
 * only runs when the camera produced a new frame.
 */
export class MediapipeSource implements DetectionSource {
  readonly mode: SourceMode = 'camera';
  readonly kind = 'mediapipe';

  private video: HTMLVideoElement | null = null;
  private stream: MediaStream | null = null;
  private fileset: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>> | null = null;
  private face: FaceLandmarker | null = null;
  private hand: HandLandmarker | null = null;
  private pose: PoseLandmarker | null = null;
  private running = false;
  private lastVideoTime = -1;
  private ts = 0;
  private detectMs = 0;
  private wantPose: boolean;

  constructor(private opts: MediapipeOptions = {}) {
    this.wantPose = !!opts.usePoseFusion;
  }

  previewElement(): HTMLVideoElement | null {
    return this.video;
  }

  stats(): SourceStats {
    return { detectMs: this.detectMs, inflight: false, detail: 'main-thread' };
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

    this.fileset = await FilesetResolver.forVisionTasks(base + 'wasm');
    this.face = await FaceLandmarker.createFromOptions(this.fileset, {
      baseOptions: { modelAssetPath: base + 'models/face_landmarker.task' },
      runningMode: 'VIDEO',
      numFaces: this.opts.maxFaces ?? 4,
    });
    this.hand = await HandLandmarker.createFromOptions(this.fileset, {
      baseOptions: { modelAssetPath: base + 'models/hand_landmarker.task' },
      runningMode: 'VIDEO',
      numHands: this.opts.maxHands ?? 4,
    });
    if (this.wantPose) await this.makePose();
    this.running = true;
  }

  private async makePose(): Promise<void> {
    if (this.pose || !this.fileset) return;
    this.pose = await PoseLandmarker.createFromOptions(this.fileset, {
      baseOptions: { modelAssetPath: base + 'models/pose_landmarker_lite.task' },
      runningMode: 'VIDEO',
      numPoses: 4,
    });
  }

  setPoseFusion(enable: boolean): void {
    this.wantPose = enable;
    if (enable) void this.makePose();
    else if (this.pose) {
      this.pose.close();
      this.pose = null;
    }
  }

  poll(now: number): DetectionFrame | null {
    if (!this.running || !this.video || !this.face || !this.hand) return null;
    if (this.video.readyState < 2) return null;
    if (this.video.currentTime === this.lastVideoTime) return null;
    this.lastVideoTime = this.video.currentTime;
    this.ts = Math.max(this.ts + 1, Math.round(now));

    const captureT = now;
    const fr = this.face.detectForVideo(this.video, this.ts);
    const hr = this.hand.detectForVideo(this.video, this.ts);
    let poses;
    if (this.wantPose && this.pose) {
      const pr = this.pose.detectForVideo(this.video, this.ts);
      poses = (pr.landmarks ?? []).map((lm) => poseFromLandmarks(lm));
    }
    const doneT = performance.now();
    this.detectMs = Math.max(0, doneT - captureT);

    return {
      t: doneT,
      captureT,
      faces: (fr.faceLandmarks ?? []).map((lm) => faceFromLandmarks(lm)),
      hands: (hr.landmarks ?? []).map((lm) => handFromLandmarks(lm)),
      poses,
    };
  }

  stop(): void {
    this.running = false;
    if (this.stream) for (const t of this.stream.getTracks()) t.stop();
    this.stream = null;
    try {
      this.face?.close();
      this.hand?.close();
      this.pose?.close();
    } catch {
      /* ignore */
    }
    this.face = null;
    this.hand = null;
    this.pose = null;
    if (this.video) {
      this.video.srcObject = null;
      this.video = null;
    }
    this.lastVideoTime = -1;
  }
}
