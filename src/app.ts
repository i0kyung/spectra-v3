import type { CharacterAdapter } from './character/adapter';
import type { Config, DetectionFrame, Expression, FaceObservation, StateName, SystemState, Track, Vec2 } from './types';
import { TrackManager } from './core/trackManager';
import { TargetSelector } from './core/targetSelector';
import { Gaze } from './core/gaze';
import { Proximity } from './core/proximity';
import { HighFive } from './core/highfive';
import { StateMachine } from './core/stateMachine';
import { EventLog } from './core/events';
import type { DetectionSource } from './detect/source';

export interface Telemetry {
  system: SystemState;
  errorMessage: string | null;
  state: StateName;
  mode: string;
  adapter: string;
  adapterIsDebug: boolean;
  targetId: number | null;
  candidateId: number | null;
  dwellProgress: number;
  faces: number;
  hands: number;
  targetSize: number;
  proxLevel: number;
  proxBand: string;
  handLevel: number;
  highFiveArmed: boolean;
  look: Vec2;
  renderFps: number;
  detectFps: number;
  eventCount: number;
  tracks: readonly Track[];
  // v2
  detectLatencyMs: number;
  pipelineLatencyMs: number;
  sourceDetail: string;
  poses: number;
  poseFusion: boolean;
  uptimeMs: number;
  /** detected hands (source-space) for the preview overlay */
  handPoints: ReadonlyArray<{ x: number; y: number; open: number }>;
}

const STATE_EXPRESSION: Record<StateName, Expression> = {
  IDLE: 'neutral',
  ACQUIRING: 'neutral',
  GREETING: 'happy',
  ENGAGED: 'neutral',
  HIGH_FIVE: 'playful',
  LOST_GRACE: 'neutral',
  FAREWELL: 'happy',
};

/** Nearest face observation to a track (maps a track back to a raw obs). */
function nearestFace(track: Track, faces: readonly FaceObservation[]): { obs: FaceObservation | null; others: FaceObservation[] } {
  let best: FaceObservation | null = null;
  let bestD = Infinity;
  for (const f of faces) {
    const d = Math.hypot(f.cx - track.cx, f.cy - track.cy);
    if (d < bestD) {
      best = f;
      bestD = d;
    }
  }
  const others = faces.filter((f) => f !== best);
  return { obs: best, others };
}

/**
 * The engine wires perception → selection → behaviour → character. It is
 * deliberately UI-agnostic: it takes a source and a character adapter and emits
 * a Telemetry snapshot each frame for whatever UI wants to render it.
 */
export class Engine {
  private tracks: TrackManager;
  private selector = new TargetSelector();
  private gaze = new Gaze();
  private prox = new Proximity();
  private highfive = new HighFive();
  private fsm: StateMachine;

  private lastFrame: DetectionFrame | null = null;
  private lastTargetPos: Vec2 | null = null;
  private system: SystemState = 'OK';
  private errorMessage: string | null = null;
  private exprOverride: Expression | null = null;

  private running = false;
  private lastNow = 0;
  private lastTickWall = 0;
  private startedAt = 0;
  private watchdog: ReturnType<typeof setInterval> | null = null;
  private onHighFive?: () => void;
  private telemetry: Telemetry;

  // fps bookkeeping
  private renderFrames = 0;
  private detectFrames = 0;
  private renderFps = 0;
  private detectFps = 0;
  private fpsSince = 0;

  constructor(
    private cfg: Config,
    private source: DetectionSource,
    private character: CharacterAdapter,
    private events: EventLog,
    private onTelemetry?: (t: Telemetry) => void,
  ) {
    this.tracks = new TrackManager(cfg.trackMatchDist, cfg.trackTtlMs, cfg.trackPredict);
    this.fsm = new StateMachine({
      greetingMs: cfg.greetingMs,
      graceMs: cfg.graceMs,
      farewellMs: cfg.farewellMs,
    });
    this.telemetry = this.blankTelemetry();
    this.character.setSignatureColor(cfg.signatureColor);
  }

  /** register a callback fired on the tick a high five triggers (viewer FX) */
  setHighFiveCallback(cb: () => void): void {
    this.onHighFive = cb;
  }

  private blankTelemetry(): Telemetry {
    return {
      system: this.system,
      errorMessage: this.errorMessage,
      state: 'IDLE',
      mode: this.source.mode,
      adapter: this.character.name,
      adapterIsDebug: this.character.isDebug,
      targetId: null,
      candidateId: null,
      dwellProgress: 0,
      faces: 0,
      hands: 0,
      targetSize: 0,
      proxLevel: 0,
      proxBand: 'far',
      handLevel: 0,
      highFiveArmed: true,
      look: { x: 0, y: 0 },
      renderFps: 0,
      detectFps: 0,
      eventCount: this.events.sessionCount(),
      tracks: [],
      detectLatencyMs: 0,
      pipelineLatencyMs: 0,
      sourceDetail: '',
      poses: 0,
      poseFusion: this.cfg.usePoseFusion,
      uptimeMs: 0,
      handPoints: [],
    };
  }

  applyConfig(cfg: Config): void {
    const prevPose = this.cfg.usePoseFusion;
    this.cfg = cfg;
    this.tracks.setParams(cfg.trackMatchDist, cfg.trackTtlMs, cfg.trackPredict);
    this.fsm.setTimes({ greetingMs: cfg.greetingMs, graceMs: cfg.graceMs, farewellMs: cfg.farewellMs });
    this.character.setSignatureColor(cfg.signatureColor);
    if (cfg.usePoseFusion !== prevPose) this.source.setPoseFusion?.(cfg.usePoseFusion);
  }

  setSource(source: DetectionSource): void {
    this.source = source;
    this.reset();
  }

  setCharacter(character: CharacterAdapter): void {
    this.character = character;
    this.character.setSignatureColor(this.cfg.signatureColor);
  }

  setExpressionOverride(e: Expression | null): void {
    this.exprOverride = e;
  }

  setSystemError(message: string | null): void {
    if (message) {
      this.system = 'CAMERA_ERROR';
      this.errorMessage = message;
    } else {
      this.system = 'OK';
      this.errorMessage = null;
    }
  }

  reset(): void {
    this.tracks.reset();
    this.selector.clearTarget();
    this.gaze.reset();
    this.prox.reset();
    this.highfive.reset();
    this.fsm.forceIdle(performance.now());
    this.lastFrame = null;
    this.lastTargetPos = null;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastNow = performance.now();
    this.fpsSince = this.lastNow;
    this.startedAt = this.lastNow;
    this.lastTickWall = Date.now();
    const loop = (now: number) => {
      if (!this.running) return;
      this.lastTickWall = Date.now();
      this.tick(now);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);

    // Watchdog: if rAF stalls (tab backgrounded / display asleep), keep the
    // behaviour running on a timer so a kiosk never freezes mid-session. When
    // visible, rAF drives every frame and this observes recent ticks and idles.
    this.watchdog = setInterval(() => {
      if (!this.running) return;
      if (Date.now() - this.lastTickWall > 250) {
        const now = performance.now();
        this.lastTickWall = Date.now();
        this.tick(now);
      }
    }, 200);
  }

  stop(): void {
    this.running = false;
    if (this.watchdog !== null) {
      clearInterval(this.watchdog);
      this.watchdog = null;
    }
  }

  getTelemetry(): Telemetry {
    return this.telemetry;
  }

  private tick(now: number): void {
    const dt = Math.min(100, Math.max(1, now - this.lastNow));
    this.lastNow = now;
    this.renderFrames++;

    // --- perception (only when a fresh frame exists) ---
    let tracks: readonly Track[];
    if (this.system === 'CAMERA_ERROR') {
      tracks = this.tracks.expire(now);
    } else {
      const frame = this.source.poll(now);
      if (frame) {
        this.lastFrame = frame;
        this.detectFrames++;
        tracks = this.tracks.update(frame);
      } else {
        tracks = this.tracks.expire(now);
      }
    }

    // --- selection + grace / re-acquire ---
    const sel = this.selector.update(tracks, this.cfg, now);
    let targetTrack = sel.targetId !== null ? this.tracks.get(sel.targetId) ?? null : null;
    const seenRecently = targetTrack !== null && now - targetTrack.lastSeen <= this.cfg.trackTtlMs;

    // remember last known target position for re-acquire
    if (targetTrack && seenRecently) this.lastTargetPos = { x: targetTrack.cx, y: targetTrack.cy };

    // try to re-acquire during grace: a face returning near the last position
    if (sel.targetId !== null && !seenRecently && this.lastTargetPos) {
      let cand: Track | null = null;
      let cd = this.cfg.reacquireDist;
      for (const t of tracks) {
        const d = Math.hypot(t.cx - this.lastTargetPos.x, t.cy - this.lastTargetPos.y);
        if (d < cd) {
          cd = d;
          cand = t;
        }
      }
      if (cand) {
        this.selector.setTarget(cand.id);
        targetTrack = cand;
      }
    }

    const targetPresent = targetTrack !== null && now - targetTrack.lastSeen <= this.cfg.trackTtlMs;
    const acquiring = sel.candidateId !== null && sel.targetId === null && sel.dwellProgress > 0;

    // --- world signals for the target ---
    let look: Vec2;
    let proxLevel = 0;
    let handLevel = 0;
    let highFiveFired = false;

    if (targetPresent && targetTrack) {
      look = this.gaze.update(targetTrack.cx, targetTrack.cy, this.cfg, dt);
      this.prox.update(targetTrack.size, this.cfg);
      proxLevel = Proximity.level(targetTrack.size, this.cfg);

      // high five only makes sense while engaged with a present target
      const st = this.fsm.current;
      if ((st === 'GREETING' || st === 'ENGAGED' || st === 'HIGH_FIVE') && this.lastFrame) {
        const { obs, others } = nearestFace(targetTrack, this.lastFrame.faces);
        if (obs) {
          const hf = this.highfive.update(obs, others, this.lastFrame.hands, this.cfg, now, this.lastFrame.poses);
          highFiveFired = hf.fired;
          handLevel = hf.hand ? hf.hand.openness : 0;
          this.telemetry.highFiveArmed = hf.armed;
        }
      }
    } else {
      look = this.gaze.center(this.cfg, dt);
      this.prox.reset();
    }

    // --- behaviour FSM ---
    const prevState = this.fsm.current;
    const step = this.fsm.update({ now, acquiring, targetPresent, highFiveFired });

    if (step.changed) {
      if (step.state === 'GREETING') this.character.playGesture('greeting');
      if (step.state === 'HIGH_FIVE') {
        this.character.playGesture('highfive');
        this.onHighFive?.();
      }
      if (step.state === 'FAREWELL' || (prevState === 'FAREWELL' && step.state === 'IDLE')) {
        // session teardown
        this.selector.clearTarget();
        this.highfive.reset();
        this.lastTargetPos = null;
      }
      // anonymous events (no-op unless operator enabled logging)
      if (step.event === 'session_start') this.events.startExperience();
      if (step.event === 'high_five') this.events.gesture(true);
      if (step.event === 'session_end') this.events.endExperience();
    }

    // --- drive the character ---
    this.character.lookAt(look);
    this.character.setExpression(this.exprOverride ?? STATE_EXPRESSION[this.fsm.current]);
    this.character.setProximity(this.prox.value);
    this.character.update(dt, now);

    // --- fps ---
    if (now - this.fpsSince >= 500) {
      const secs = (now - this.fpsSince) / 1000;
      this.renderFps = Math.round(this.renderFrames / secs);
      this.detectFps = Math.round(this.detectFrames / secs);
      this.renderFrames = 0;
      this.detectFrames = 0;
      this.fpsSince = now;
    }

    // --- telemetry ---
    this.telemetry.system = this.system;
    this.telemetry.errorMessage = this.errorMessage;
    this.telemetry.state = this.fsm.current;
    this.telemetry.mode = this.source.mode;
    this.telemetry.adapter = this.character.name;
    this.telemetry.adapterIsDebug = this.character.isDebug;
    this.telemetry.targetId = sel.targetId;
    this.telemetry.candidateId = sel.candidateId;
    this.telemetry.dwellProgress = sel.dwellProgress;
    this.telemetry.faces = this.lastFrame?.faces.length ?? 0;
    this.telemetry.hands = this.lastFrame?.hands.length ?? 0;
    this.telemetry.targetSize = targetTrack?.size ?? 0;
    this.telemetry.proxLevel = proxLevel;
    this.telemetry.proxBand = this.prox.value;
    this.telemetry.handLevel = handLevel;
    this.telemetry.look = look;
    this.telemetry.renderFps = this.renderFps;
    this.telemetry.detectFps = this.detectFps;
    this.telemetry.eventCount = this.events.sessionCount();
    this.telemetry.tracks = tracks;

    // v2: latency + uptime + pose
    const st = this.source.stats?.();
    this.telemetry.detectLatencyMs = st?.detectMs ?? (this.lastFrame?.captureT != null ? Math.round(this.lastFrame.t - this.lastFrame.captureT) : 0);
    this.telemetry.pipelineLatencyMs = this.lastFrame?.captureT != null ? Math.round(now - this.lastFrame.captureT) : 0;
    this.telemetry.sourceDetail = st?.detail ?? '';
    this.telemetry.poses = this.lastFrame?.poses?.length ?? 0;
    this.telemetry.poseFusion = this.cfg.usePoseFusion;
    this.telemetry.uptimeMs = this.running ? now - this.startedAt : 0;
    this.telemetry.handPoints = this.lastFrame ? this.lastFrame.hands.map((h) => ({ x: h.cx, y: h.cy, open: h.openness })) : [];

    this.onTelemetry?.(this.telemetry);
  }
}
