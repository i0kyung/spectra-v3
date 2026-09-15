import type { DetectionFrame, SourceMode } from '../types';

export type CameraErrorKind = 'denied' | 'nodevice' | 'inuse' | 'disconnected' | 'insecure' | 'unknown';

export class CameraError extends Error {
  constructor(
    public kind: CameraErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'CameraError';
  }
}

export interface SourceStats {
  /** last capture→detection latency in ms (0 if n/a) */
  detectMs: number;
  /** whether an inference is currently in flight */
  inflight: boolean;
  /** detail label for the operator, e.g. 'worker' / 'main-thread' */
  detail: string;
}

export interface DetectionSource {
  readonly mode: SourceMode;
  /** short kind label surfaced to the operator, e.g. 'mediapipe' / 'simulation' */
  readonly kind: string;
  start(): Promise<void>;
  stop(): void;
  /** latest frame since the previous poll, or null if none is newly available */
  poll(now: number): DetectionFrame | null;
  /** operator-preview element (a <video> for camera, or null) */
  previewElement(): HTMLVideoElement | null;
  /** enable/disable pose fusion at runtime (no-op for sources without pose) */
  setPoseFusion?(enable: boolean): void;
  /** optional perf stats for the operator panel */
  stats?(): SourceStats;
}
