import { DEFAULT_CONFIG, loadConfig, resetConfig, saveConfig } from './config';
import type { Config, Expression, StateName } from './types';
import { Engine, type Telemetry } from './app';
import { EventLog } from './core/events';
import { SimSource } from './detect/simSource';
import { MediapipeSource } from './detect/mediapipeSource';
import { WorkerSource } from './detect/workerSource';
import { ScenarioSource, SCENARIOS, type ScenarioName } from './detect/scenarioSource';
import { CameraError, type DetectionSource } from './detect/source';
import { ImageAdapter } from './character/imageAdapter';
import { DebugGlyphAdapter } from './character/debugGlyphAdapter';
import type { CharacterAdapter } from './character/adapter';
import { Particles } from './ui/particles';
import { Sparkline } from './ui/sparkline';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

let cfg: Config = loadConfig();
const events = new EventLog();
const sim = new SimSource();
const scenario = new ScenarioSource('engage');
let camera: DetectionSource | null = null;

const charMount = $('charMount');
let adapter: CharacterAdapter = new ImageAdapter();
await adapter.mount(charMount);

const engine = new Engine(cfg, sim, adapter, events, onTelemetry);
const particles = new Particles(document.body);
particles.setColor(cfg.signatureColor);
engine.setHighFiveCallback(() => { if (cfg.particles) particles.burst(0.5, 0.42); });
engine.start();
sim.setPresent(false);

const spF = new Sparkline($('spF') as HTMLCanvasElement, cfg.signatureColor, 60);
const spL = new Sparkline($('spL') as HTMLCanvasElement, '#ffb84d', 60);

// ---------------------------------------------------------------------------
// viewer ambience
// ---------------------------------------------------------------------------
const CAP: Record<StateName, string> = {
  IDLE: '앞에 서서 손을 흔들어 주세요',
  ACQUIRING: '',
  GREETING: '',
  ENGAGED: '',
  HIGH_FIVE: '',
  LOST_GRACE: '',
  FAREWELL: '',
};
const captionEl = $('caption');
const errBox = $('err');

function paintViewer(t: Telemetry) {
  document.body.classList.toggle('lit', t.state !== 'IDLE' && t.system === 'OK');
  document.body.classList.toggle('peak', t.state === 'GREETING' || t.state === 'HIGH_FIVE');
  const cap = t.system === 'OK' ? CAP[t.state] : '';
  captionEl.textContent = cap;
  captionEl.classList.toggle('on', !!cap);
  errBox.classList.toggle('on', t.system === 'CAMERA_ERROR');
}

// ---------------------------------------------------------------------------
// viewer recognition + hand indicators
// ---------------------------------------------------------------------------
const recog = $('recog');
const recogText = $('recogText');
const handchip = $('handchip');
const handText = $('handText');
const handProg = $('handProg') as HTMLElement;

function updateIndicators(t: Telemetry) {
  // top recognition pill
  if (t.system === 'CAMERA_ERROR') {
    recog.style.opacity = '0';
  } else {
    recog.style.opacity = '1';
    const hasTarget = t.targetId !== null;
    recog.classList.toggle('hot', hasTarget);
    recog.classList.toggle('live', hasTarget || t.candidateId !== null);
    if (t.state === 'HIGH_FIVE') recogText.textContent = '✋ 하이파이브!';
    else if (hasTarget) recogText.textContent = '서윤이 당신을 바라봐요';
    else if (t.candidateId !== null) recogText.textContent = '인식 중…';
    else recogText.textContent = t.mode === 'camera' ? '대기 중 · 카메라 앞에 서보세요' : '대기 중';
  }

  // bottom hand indicator — visible while engaged with a target
  const engaged = t.targetId !== null && (t.state === 'GREETING' || t.state === 'ENGAGED' || t.state === 'HIGH_FIVE');
  handchip.hidden = !engaged;
  if (engaged) {
    const fire = t.state === 'HIGH_FIVE';
    const detect = t.handLevel > 0.05;
    handchip.classList.toggle('fire', fire);
    handchip.classList.toggle('detect', detect && !fire);
    handProg.style.width = (fire ? 1 : t.handLevel) * 100 + '%';
    handText.textContent = fire ? '하이파이브 성공!' : detect ? '손 인식됨 — 손바닥을 펴고 유지' : '손을 들어 하이파이브';
  }
}

// ---------------------------------------------------------------------------
// operator panel refs
// ---------------------------------------------------------------------------
const ladder = $('ladder');
const overlay = $('overlay') as HTMLCanvasElement;
const octx = overlay.getContext('2d')!;
const previewVideo = $('preview') as HTMLVideoElement;

function onTelemetry(t: Telemetry) {
  paintViewer(t);
  updateIndicators(t);
  // ladder
  for (const li of Array.from(ladder.children) as HTMLElement[]) {
    li.classList.toggle('active', li.dataset.s === t.state);
  }
  setMeter('mArea', 'vArea', t.targetSize / 0.5);
  setMeter('mProx', 'vProx', t.proxLevel);
  setMeter('mHand', 'vHand', t.handLevel);
  setMeter('mDwell', 'vDwell', t.dwellProgress);
  $('bMode').textContent = t.mode === 'camera' ? '실제 카메라' : '시뮬레이션';
  $('bMode').className = 'badge ' + (t.mode === 'camera' ? 'cam' : 'sim');
  $('bAdapter').textContent = t.adapterIsDebug ? '테스트 캐릭터' : t.adapter;
  $('bAdapter').className = 'badge ' + (t.adapterIsDebug ? 'test' : '');
  $('flag').textContent = t.system === 'CAMERA_ERROR' ? '카메라 오류' : t.mode === 'camera' ? '추적 중' : '시뮬레이션';
  $('mState').textContent = `${t.state} / ${t.system}`;
  $('mRfps').textContent = String(t.renderFps);
  $('mDfps').textContent = String(t.detectFps);
  $('mLat').textContent = `${t.detectLatencyMs} ms`;
  $('mPipe').textContent = `${t.pipelineLatencyMs} ms`;
  $('mFH').textContent = `${t.faces} / ${t.hands} / ${t.poses}`;
  $('mUp').textContent = fmtUptime(t.uptimeMs);
  $('bSource').textContent = t.mode === 'camera' ? (t.sourceDetail || 'camera') : (t.sourceDetail || 'sim');
  $('evCount').textContent = String(t.eventCount);
  $('evSummary').textContent = eventSummary();
  if (fpsTick++ % 6 === 0) { spF.push(t.renderFps); spL.push(t.detectLatencyMs); }
  wizardArrow(t.look);
  drawOverlay(t);
}

let fpsTick = 0;
function fmtUptime(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
function eventSummary(): string {
  const evs = events.all();
  const fives = evs.filter((e) => e.type === 'gesture').length;
  const ends = evs.filter((e) => e.type === 'experience_end') as Array<{ durationMs: number }>;
  const avg = ends.length ? Math.round(ends.reduce((a, e) => a + e.durationMs, 0) / ends.length / 1000) : 0;
  return `${fives} / ${avg}`;
}

function setMeter(bar: string, val: string, v: number) {
  const p = Math.round(Math.max(0, Math.min(1, v)) * 100);
  ($(bar) as HTMLElement).style.width = p + '%';
  $(val).textContent = p + '%';
}

// mirror helpers: preview shows a mirrored (selfie) video; detections are in
// source space. Convert x when drawing / editing so screen and data align.
const s2x = (cx: number) => 1 - cx;

function drawOverlay(t: Telemetry) {
  const w = overlay.width, h = overlay.height;
  const rect = overlay.getBoundingClientRect();
  if (overlay.width !== Math.round(rect.width) || overlay.height !== Math.round(rect.height)) {
    overlay.width = Math.max(1, Math.round(rect.width));
    overlay.height = Math.max(1, Math.round(rect.height));
  }
  octx.clearRect(0, 0, w, h);
  // ROI
  const r = cfg.roi;
  octx.strokeStyle = cfg.signatureColor;
  octx.lineWidth = 1.5;
  octx.setLineDash([5, 4]);
  const rx = s2x(r.x + r.w) * w;
  octx.strokeRect(rx, r.y * h, r.w * w, r.h * h);
  octx.setLineDash([]);
  // faces (tracks) as boxes — target highlighted
  for (const tr of t.tracks) {
    const x = s2x(tr.cx) * w;
    const y = tr.cy * h;
    const bw = Math.max(18, tr.size * w * 0.9);
    const bh = bw * 1.15;
    const isTarget = tr.id === t.targetId;
    const isCand = tr.id === t.candidateId && !isTarget;
    octx.lineWidth = isTarget ? 2.5 : 1.5;
    octx.strokeStyle = isTarget ? cfg.signatureColor : isCand ? '#ffb84d' : 'rgba(255,255,255,.55)';
    roundRect(octx, x - bw / 2, y - bh / 2, bw, bh, 6);
    octx.stroke();
    if (isTarget) {
      octx.fillStyle = cfg.signatureColor;
      octx.font = '600 10px system-ui';
      octx.fillText('대상', x - bw / 2, y - bh / 2 - 4);
    }
  }
  // hands as dots (green = open/ready)
  for (const hp of t.handPoints) {
    const x = s2x(hp.x) * w;
    const y = hp.y * h;
    octx.beginPath();
    octx.arc(x, y, 7, 0, Math.PI * 2);
    octx.fillStyle = hp.open > 0.4 ? 'rgba(60,230,160,.9)' : 'rgba(255,184,77,.9)';
    octx.fill();
    octx.strokeStyle = 'rgba(255,255,255,.9)';
    octx.lineWidth = 1.5;
    octx.stroke();
  }
}

function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

// ---------------------------------------------------------------------------
// input mode switching
// ---------------------------------------------------------------------------
function clearActive() {
  for (const id of ['btnSim', 'btnCam', 'btnScen']) $(id).classList.remove('on');
}

function toSim() {
  camera?.stop();
  camera = null;
  scenario.stop();
  previewVideo.srcObject = null;
  engine.setSystemError(null);
  engine.setSource(sim);
  clearActive();
  $('btnSim').classList.add('on');
  errBox.classList.remove('on');
}

function toScenario() {
  camera?.stop();
  camera = null;
  previewVideo.srcObject = null;
  engine.setSystemError(null);
  scenario.setScenario(($('scenSel') as HTMLSelectElement).value as ScenarioName);
  engine.setSource(scenario);
  clearActive();
  $('btnScen').classList.add('on');
  errBox.classList.remove('on');
  showToast('시나리오(합성 입력) 재생 중입니다. 실제 카메라가 아닙니다.', 3500);
}

async function toCamera() {
  const opts = {
    maxFaces: 4,
    maxHands: 4,
    usePoseFusion: cfg.usePoseFusion,
    onError: (_k: string, msg: string) => showCamError('카메라 연결 끊김', msg),
  };
  const wantWorker = cfg.useWorker && WorkerSource.supported();
  try {
    showToast('카메라와 모델을 준비하고 있습니다…', 4000);
    let cam: DetectionSource;
    let detail = '메인스레드';
    if (wantWorker) {
      try {
        cam = new WorkerSource(opts);
        await cam.start();
        detail = '워커';
      } catch (werr) {
        // worker path failed (e.g. blocked on this host) — fall back to main thread
        console.warn('[SPECTRA] worker source failed, falling back to main thread:', werr);
        cam = new MediapipeSource(opts);
        await cam.start();
      }
    } else {
      cam = new MediapipeSource(opts);
      await cam.start();
    }
    camera = cam;
    engine.setSystemError(null);
    engine.setSource(cam);
    const v = cam.previewElement();
    if (v) {
      previewVideo.srcObject = v.srcObject;
      await previewVideo.play().catch(() => {});
    }
    clearActive();
    $('btnCam').classList.add('on');
    errBox.classList.remove('on');
    showToast(`카메라 모드(${detail})입니다. 체험 구역(ROI)에 한 명이 들어오면 캐릭터가 그 사람을 바라봅니다.`, 5000);
  } catch (e) {
    const ce = e instanceof CameraError ? e : new CameraError('unknown', String(e));
    const title =
      ce.kind === 'denied' ? '권한 거부' :
      ce.kind === 'nodevice' ? '카메라 없음' :
      ce.kind === 'inuse' ? '카메라 사용 중' :
      ce.kind === 'insecure' ? '보안 컨텍스트 필요' : '카메라 오류';
    showCamError(title, ce.message);
  }
}

function showCamError(title: string, msg: string) {
  $('errTitle').textContent = title;
  $('errMsg').textContent = msg;
  engine.setSystemError(msg);
  errBox.classList.add('on');
}

$('btnCam').addEventListener('click', toCamera);
$('btnStop').addEventListener('click', () => { camera?.stop(); toSim(); });
$('btnSim').addEventListener('click', toSim);
$('errSim').addEventListener('click', toSim);
$('errRetry').addEventListener('click', toCamera);

// scenario auto-player
const scenSel = $('scenSel') as HTMLSelectElement;
for (const s of SCENARIOS) {
  const o = document.createElement('option');
  o.value = s.id;
  o.textContent = s.label;
  scenSel.appendChild(o);
}
scenSel.value = 'engage';
$('btnScen').addEventListener('click', toScenario);
scenSel.addEventListener('change', () => {
  if ($('btnScen').classList.contains('on')) scenario.setScenario(scenSel.value as ScenarioName);
});

// worker capability note
$('workerNote').textContent = WorkerSource.supported()
  ? '인식 처리: 지원 시 Web Worker(오프로딩), 미지원 시 메인스레드 자동 폴백.'
  : '인식 처리: 이 브라우저는 Worker/ImageBitmap 미지원 → 메인스레드 경로 사용.';

// ---------------------------------------------------------------------------
// simulation pointer / keyboard
// ---------------------------------------------------------------------------
const stage = $('stage');
stage.addEventListener('pointermove', (e) => {
  if (engine.getTelemetry().mode !== 'simulation') return;
  const r = stage.getBoundingClientRect();
  const nx = (e.clientX - r.left) / r.width;
  const ny = (e.clientY - r.top) / r.height;
  sim.setPointer(nx, ny);
  sim.setSize(0.18 + ny * 0.26); // lower on screen = closer/bigger
});
stage.addEventListener('pointerleave', () => sim.setPresent(false));
stage.addEventListener('pointerdown', () => sim.setRaised(true));
window.addEventListener('pointerup', () => sim.setRaised(false));

document.addEventListener('keydown', (e) => {
  if ((e.target as HTMLElement).tagName === 'INPUT') return;
  const k = e.key.toLowerCase();
  if (k === ' ') { e.preventDefault(); sim.setRaised(true); }
  if (k === 'f') togglePresent();
  if (k === 'c') toCamera();
});
document.addEventListener('keyup', (e) => {
  if (e.key === ' ') sim.setRaised(false);
});

// ---------------------------------------------------------------------------
// ROI drag on preview overlay
// ---------------------------------------------------------------------------
let roiDrag: { x: number; y: number } | null = null;
overlay.addEventListener('pointerdown', (e) => {
  overlay.setPointerCapture(e.pointerId);
  const p = ovNorm(e);
  roiDrag = { x: p.x, y: p.y };
});
overlay.addEventListener('pointermove', (e) => {
  if (!roiDrag) return;
  const p = ovNorm(e);
  const x0 = Math.min(roiDrag.x, p.x), x1 = Math.max(roiDrag.x, p.x);
  const y0 = Math.min(roiDrag.y, p.y), y1 = Math.max(roiDrag.y, p.y);
  // convert screen-x (mirrored) back to source-x
  cfg.roi = { x: s2x(x1), y: y0, w: Math.max(0.05, x1 - x0), h: Math.max(0.05, y1 - y0) };
  engine.applyConfig(cfg);
});
overlay.addEventListener('pointerup', () => { roiDrag = null; saveConfig(cfg); });
function ovNorm(e: PointerEvent) {
  const r = overlay.getBoundingClientRect();
  return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
}

// ---------------------------------------------------------------------------
// adapter swap + expression override
// ---------------------------------------------------------------------------
async function swapAdapter(kind: 'image' | 'glyph') {
  const next: CharacterAdapter = kind === 'glyph' ? new DebugGlyphAdapter() : new ImageAdapter();
  await next.mount(charMount);
  const old = adapter;
  adapter = next;
  engine.setCharacter(next);
  old.dispose();
  $('adSprite').classList.toggle('on', kind === 'image');
  $('adGlyph').classList.toggle('on', kind === 'glyph');
}
$('adSprite').addEventListener('click', () => swapAdapter('image'));
$('adGlyph').addEventListener('click', () => swapAdapter('glyph'));

$('emo').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest('button');
  if (!b) return;
  for (const x of Array.from($('emo').children)) x.classList.toggle('on', x === b);
  const em = b.dataset.e;
  engine.setExpressionOverride(em === 'auto' ? null : (em as Expression));
});

// ---------------------------------------------------------------------------
// signature color
// ---------------------------------------------------------------------------
$('sw').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest('.sw') as HTMLElement | null;
  if (!b) return;
  for (const x of document.querySelectorAll('.sw')) x.classList.remove('on');
  b.classList.add('on');
  cfg.signatureColor = b.dataset.c!;
  document.documentElement.style.setProperty('--sig', cfg.signatureColor);
  particles.setColor(cfg.signatureColor);
  spF.setColor(cfg.signatureColor);
  engine.applyConfig(cfg);
  saveConfig(cfg);
});

// ---------------------------------------------------------------------------
// sliders / toggles bound to config
// ---------------------------------------------------------------------------
function bindRange(id: string, get: () => number, set: (v: number) => void) {
  const el = $(id) as HTMLInputElement;
  el.value = String(get());
  el.addEventListener('input', () => { set(Number(el.value)); engine.applyConfig(cfg); saveConfig(cfg); });
}
function bindCheck(id: string, get: () => boolean, set: (v: boolean) => void) {
  const el = $(id) as HTMLInputElement;
  el.checked = get();
  el.addEventListener('change', () => { set(el.checked); engine.applyConfig(cfg); saveConfig(cfg); });
}

function bindAll() {
  bindCheck('flipX', () => cfg.flipX, (v) => (cfg.flipX = v));
  bindCheck('flipY', () => cfg.flipY, (v) => (cfg.flipY = v));
  bindRange('gain', () => cfg.gazeGain, (v) => (cfg.gazeGain = v));
  bindRange('dead', () => cfg.gazeDeadzone, (v) => (cfg.gazeDeadzone = v));
  bindRange('smooth', () => cfg.gazeSmoothMs, (v) => (cfg.gazeSmoothMs = v));
  bindRange('nearEnter', () => cfg.nearEnter, (v) => (cfg.nearEnter = v));
  bindRange('nearExit', () => cfg.nearExit, (v) => (cfg.nearExit = v));
  bindRange('dwell', () => cfg.dwellMs, (v) => (cfg.dwellMs = v));
  bindRange('grace', () => cfg.graceMs, (v) => (cfg.graceMs = v));
  bindRange('hfHold', () => cfg.highFiveHoldMs, (v) => (cfg.highFiveHoldMs = v));
  bindRange('hfCool', () => cfg.highFiveCooldownMs, (v) => (cfg.highFiveCooldownMs = v));
  bindCheck('optPose', () => cfg.usePoseFusion, (v) => (cfg.usePoseFusion = v));
  bindCheck('optPredict', () => cfg.trackPredict, (v) => (cfg.trackPredict = v));
  bindCheck('optParticles', () => cfg.particles, (v) => (cfg.particles = v));
}
bindAll();
document.documentElement.style.setProperty('--sig', cfg.signatureColor);

// ---------------------------------------------------------------------------
// events panel
// ---------------------------------------------------------------------------
($('evEnable') as HTMLInputElement).checked = events.isEnabled();
($('evRet') as HTMLInputElement).value = String(events.getRetentionDays());
$('evEnable').addEventListener('change', (e) => events.setEnabled((e.target as HTMLInputElement).checked));
$('evRet').addEventListener('input', (e) => events.setRetentionDays(Number((e.target as HTMLInputElement).value)));
$('evJson').addEventListener('click', () => download('spectra-events.json', events.exportJson(), 'application/json'));
$('evCsv').addEventListener('click', () => download('spectra-events.csv', events.exportCsv(), 'text/csv'));
$('evClear').addEventListener('click', () => { if (confirm('로컬 이벤트를 모두 삭제할까요?')) events.clearAll(); });

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------------------------------------------------------------------------
// save / reset / presentation
// ---------------------------------------------------------------------------
$('btnSave').addEventListener('click', () => { saveConfig(cfg); showToast('설정을 저장했습니다.', 1800); });
$('btnReset').addEventListener('click', () => {
  cfg = resetConfig();
  engine.applyConfig(cfg);
  bindAll();
  document.documentElement.style.setProperty('--sig', cfg.signatureColor);
  showToast('기본값으로 초기화했습니다.', 1800);
});

const hud = $('hud');
function togglePresent() {
  hud.classList.toggle('hidden');
  $('btnPresent').classList.toggle('on', hud.classList.contains('hidden'));
}
$('btnPresent').addEventListener('click', togglePresent);

// ---------------------------------------------------------------------------
// calibration wizard: drives a simulated target to a known spot so the operator
// can confirm (and fix) the gaze mapping with the flip toggles.
// ---------------------------------------------------------------------------
let wizStep = 0; // 0 = off, 1 = horizontal, 2 = vertical
$('wizStart').addEventListener('click', () => {
  wizStep = (wizStep + 1) % 3;
  const msg = $('wizMsg');
  if (wizStep === 0) {
    msg.hidden = true;
    $('wizArrow').textContent = '·';
    $('wizStart').classList.remove('on');
    sim.setPresent(false);
    return;
  }
  $('wizStart').classList.add('on');
  toSim();
  msg.hidden = false;
  if (wizStep === 1) {
    sim.setPointer(0.85, 0.5);
    sim.setSize(0.32);
    msg.innerHTML = '① 관람객이 <b>화면 오른쪽</b>에 섰다고 가정. 캐릭터가 <b>오른쪽(→)</b>을 보면 정상, 반대(←)면 위의 <b>좌우 반전</b>을 토글하세요. [보정 도우미]로 다음.';
  } else {
    sim.setPointer(0.5, 0.12);
    sim.setSize(0.32);
    msg.innerHTML = '② 관람객이 <b>화면 위쪽</b>에 섰다고 가정. 캐릭터가 <b>위(↑)</b>를 보면 정상, 반대(↓)면 <b>상하 반전</b>을 토글하세요. [보정 도우미]로 완료.';
  }
});
function wizardArrow(look: { x: number; y: number }) {
  if (wizStep === 0) return;
  const el = $('wizArrow');
  if (wizStep === 1) el.textContent = look.x > 0.1 ? '→ 오른쪽' : look.x < -0.1 ? '← 왼쪽' : '· 중앙';
  else el.textContent = look.y < -0.1 ? '↑ 위' : look.y > 0.1 ? '↓ 아래' : '· 중앙';
}

// ---------------------------------------------------------------------------
// toast
// ---------------------------------------------------------------------------
let toastTimer: number | undefined;
const toast = $('toast');
function showToast(html: string, ms = 4000) {
  toast.innerHTML = html;
  toast.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove('on'), ms);
}

// sync slider defaults if config had none (first run)
void DEFAULT_CONFIG;
showToast('시뮬레이션 모드입니다. 화면 위에서 마우스를 움직이면 캐릭터가 바라보고, <b>누르고 있으면</b> 하이파이브를 시도합니다. 실제 시연은 <b>카메라 시작</b>.', 7000);
