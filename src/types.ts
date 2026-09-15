// ---------------------------------------------------------------------------
// Shared domain model.
//
// All coordinates here are NORMALIZED image coordinates in [0,1], with the
// origin at the top-left of the *source* frame (before any mirror). Mirroring
// and axis flips for the display are applied later, in gaze mapping, and are
// operator-configurable — never baked into detection.
// ---------------------------------------------------------------------------

export interface Vec2 {
  x: number;
  y: number;
}

/** One detected face in a single frame (source-space, pre-mirror). */
export interface FaceObservation {
  /** bbox center */
  cx: number;
  cy: number;
  /** bbox height as a fraction of frame height (proxy for closeness) */
  size: number;
}

/** One detected hand in a single frame (source-space, pre-mirror). */
export interface HandObservation {
  /** palm center (approx. landmark 9 / wrist blend) */
  cx: number;
  cy: number;
  /** 0 = fist, 1 = open palm (finger-spread heuristic) */
  openness: number;
}

/** One detected upper body (v2, pose fusion). Only what we need for hand attribution. */
export interface PoseObservation {
  /** shoulder-center (torso anchor), used to map a pose to a face */
  cx: number;
  cy: number;
  leftWrist: Vec2 | null;
  rightWrist: Vec2 | null;
}

/** Raw per-frame output of ANY detection source. */
export interface DetectionFrame {
  /** monotonic time of this frame, ms */
  t: number;
  faces: FaceObservation[];
  hands: HandObservation[];
  /** upper-body poses; present only when pose fusion is enabled (v2) */
  poses?: PoseObservation[];
  /** wall/monotonic time the camera frame was captured, for latency (v2) */
  captureT?: number;
}

/** A session-local, temporary identity for a face across frames. NOT a person. */
export interface Track {
  /** ephemeral id, unique within a session only */
  id: number;
  cx: number;
  cy: number;
  size: number;
  /** velocity (units/sec) in normalized space */
  vx: number;
  vy: number;
  /** ms timestamp last matched to an observation */
  lastSeen: number;
  /** ms timestamp first created */
  firstSeen: number;
  /** running match confidence 0..1 */
  confidence: number;
  /** frames matched so far */
  hits: number;
}

/** Rectangular experience region, normalized, source-space (pre-mirror). */
export interface Roi {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type StateName =
  | 'IDLE'
  | 'ACQUIRING'
  | 'ENGAGED'
  | 'GREETING'
  | 'HIGH_FIVE'
  | 'LOST_GRACE'
  | 'FAREWELL';

/** Camera failure is a *system* condition managed outside the behaviour FSM. */
export type SystemState = 'OK' | 'CAMERA_ERROR';

export type Expression = 'neutral' | 'happy' | 'playful' | 'sad' | 'cry' | 'angry';

export type GestureName = 'greeting' | 'highfive';

export type ProximityBand = 'near' | 'far';

export type SourceMode = 'camera' | 'simulation';

/** Everything the operator can tune. Times are ms unless noted. */
export interface Config {
  // --- target selection ---
  roi: Roi;
  /** dwell inside ROI before a candidate is selected */
  dwellMs: number;
  /** weight of centre-proximity vs face-size when ranking candidates (0..1) */
  centerWeight: number;
  /** after selection, a rival must beat the target's score by this margin to steal it (it never does in MVP unless target lost) */
  stealMargin: number;

  // --- tracking ---
  /** max normalized distance to match an observation to an existing track */
  trackMatchDist: number;
  /** track is dropped if unseen for longer than this */
  trackTtlMs: number;
  /** v2: match against velocity-predicted position (reduces ID swaps at crossings) */
  trackPredict: boolean;

  // --- lost / grace ---
  graceMs: number;
  /** how close (norm dist) a returning face must be to reclaim the target */
  reacquireDist: number;

  // --- gaze ---
  flipX: boolean;
  flipY: boolean;
  gazeGain: number;
  /** ignore movements smaller than this (norm) to kill jitter */
  gazeDeadzone: number;
  /** max |look| output on each axis */
  gazeMaxX: number;
  gazeMaxY: number;
  /** time-constant for gaze smoothing (ms); larger = smoother/slower */
  gazeSmoothMs: number;

  // --- proximity (hysteresis on face size) ---
  nearEnter: number;
  nearExit: number;

  // --- high five ---
  /** hand must be within this norm distance of the target face to be "theirs" */
  handAssocRadius: number;
  /** target's hand must be closer than any other face's by at least this margin */
  handAmbiguityMargin: number;
  /** palm openness threshold */
  palmOpenMin: number;
  /** vertical zone (norm y, source space): hand above this line counts as raised */
  raiseLineY: number;
  /** hold time before HIGH_FIVE fires */
  highFiveHoldMs: number;
  /** cooldown after a high five before it can fire again */
  highFiveCooldownMs: number;

  // --- v2: perception / rendering options ---
  /** use pose (shoulder/wrist) to attribute hands to people (needs pose model) */
  usePoseFusion: boolean;
  /** run MediaPipe in a Web Worker when supported (keeps UI smooth) */
  useWorker: boolean;
  /** viewer particle burst on high five */
  particles: boolean;

  // --- misc ---
  greetingMs: number;
  farewellMs: number;
  signatureColor: string;
}
