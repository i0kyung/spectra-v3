import type { CharacterAdapter } from './adapter';
import type { Expression, GestureName, ProximityBand, Vec2 } from '../types';

const BASE = import.meta.env.BASE_URL + 'assets/characters/';
const IMG_BASE = BASE + 'main/';
const EXPRESSIONS: Expression[] = ['neutral', 'happy', 'playful', 'sad', 'cry', 'angry'];

interface GestureAnim {
  name: GestureName;
  start: number;
  dur: number;
}

/**
 * Image character (서윤 · VELO). Transparent full-body PNGs, one per expression,
 * swapped by state with a soft crossfade — calm, no looping. The HIGH FIVE is
 * the one "highlight" that plays a short VIDEO clip for motion, then returns to
 * the still image. Gaze is a gentle body lean.
 */
export class ImageAdapter implements CharacterAdapter {
  readonly name = '이미지 (서윤 · VELO)';
  readonly isDebug = false;

  private root!: HTMLDivElement;
  private frames = new Map<Expression, HTMLImageElement>();
  private hi5!: HTMLVideoElement;
  private hi5timer: ReturnType<typeof setTimeout> | null = null;
  private look: Vec2 = { x: 0, y: 0 };
  private disp: Vec2 = { x: 0, y: 0 };
  private expression: Expression = 'neutral';
  private proxScale = 1;
  private proxScaleT = 1;
  private gesture: GestureAnim | null = null;
  private color = '#2bb8c4';

  async mount(container: HTMLElement): Promise<void> {
    injectStyleOnce();
    this.root = document.createElement('div');
    this.root.className = 'im-char';
    const loads: Promise<unknown>[] = [];
    for (const e of EXPRESSIONS) {
      const img = document.createElement('img');
      img.className = 'im-frame';
      img.alt = e === 'neutral' ? '캐릭터 서윤' : '';
      img.decoding = 'async';
      img.src = IMG_BASE + e + '.png';
      if (e === 'neutral') img.classList.add('show');
      this.frames.set(e, img);
      this.root.appendChild(img);
      loads.push(img.decode().catch(() => {}));
    }
    // high-five highlight video (motion), hidden until triggered
    this.hi5 = document.createElement('video');
    this.hi5.className = 'im-hi5';
    this.hi5.src = BASE + 'highfive.mp4';
    this.hi5.muted = true;
    this.hi5.playsInline = true;
    this.hi5.preload = 'auto';
    this.hi5.loop = false;
    this.hi5.addEventListener('ended', () => this.endHi5());
    this.root.appendChild(this.hi5);

    container.appendChild(this.root);
    await Promise.race([Promise.all(loads), delay(2500)]);
  }

  lookAt(v: Vec2): void {
    this.look = v;
  }
  setExpression(e: Expression): void {
    if (e === this.expression) return;
    this.expression = e;
    if (this.hi5.classList.contains('show')) return; // video highlight is on top
    this.showImage(e);
  }
  private showImage(e: Expression): void {
    for (const [k, img] of this.frames) img.classList.toggle('show', k === e);
  }
  playGesture(g: GestureName): void {
    this.gesture = { name: g, start: performance.now(), dur: g === 'highfive' ? 1300 : 1000 };
    if (g === 'highfive') this.startHi5();
  }
  private startHi5(): void {
    this.hi5.classList.add('show');
    try {
      this.hi5.currentTime = 0;
    } catch {
      /* ignore */
    }
    void this.hi5.play().catch(() => {});
    if (this.hi5timer) clearTimeout(this.hi5timer);
    this.hi5timer = setTimeout(() => this.endHi5(), 2800); // safety
  }
  private endHi5(): void {
    if (this.hi5timer) {
      clearTimeout(this.hi5timer);
      this.hi5timer = null;
    }
    this.hi5.classList.remove('show');
    this.showImage(this.expression);
  }
  setProximity(band: ProximityBand): void {
    this.proxScaleT = band === 'near' ? 1.05 : 1.0;
  }
  setSignatureColor(color: string): void {
    this.color = color;
  }

  update(dtMs: number, now: number): void {
    const a = 1 - Math.exp(-dtMs / 110);
    this.disp.x += (this.look.x - this.disp.x) * a;
    this.disp.y += (this.look.y - this.disp.y) * a;
    this.proxScale += (this.proxScaleT - this.proxScale) * (1 - Math.exp(-dtMs / 170));

    const breathe = Math.sin((now / 1000) * 1.2) * 0.25;
    let popY = 0;
    let tilt = 0;
    let gScale = 1;
    let wave = 0;
    if (this.gesture) {
      const p = (now - this.gesture.start) / this.gesture.dur;
      if (p >= 1) this.gesture = null;
      else {
        const env = Math.sin(Math.min(1, p) * Math.PI);
        if (this.gesture.name === 'highfive') {
          popY = -14 * env;
          gScale = 1 + 0.04 * env;
        } else {
          popY = -8 * env;
          gScale = 1 + 0.02 * env;
          wave = Math.sin(p * Math.PI * 5) * 4 * env;
        }
      }
    }

    const tx = this.disp.x * 16;
    const ty = this.disp.y * 8 + breathe + popY;
    const rot = this.disp.x * 2 + tilt + wave;
    const scale = this.proxScale * gScale;
    this.root.style.transform = `translate(${tx.toFixed(2)}px, ${ty.toFixed(2)}px) rotate(${rot.toFixed(2)}deg) scale(${scale.toFixed(3)})`;
    this.root.style.filter = `drop-shadow(0 12px 22px rgba(40,50,80,.16)) drop-shadow(0 0 24px ${this.color}22)`;
  }

  dispose(): void {
    if (this.hi5timer) clearTimeout(this.hi5timer);
    try {
      this.hi5.pause();
      this.hi5.src = '';
    } catch {
      /* ignore */
    }
    this.root?.remove();
    this.frames.clear();
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

let styled = false;
function injectStyleOnce(): void {
  if (styled) return;
  styled = true;
  const s = document.createElement('style');
  s.textContent = `
  .im-char{position:relative;height:min(94vh,150vw);aspect-ratio:1000/1493;will-change:transform;transform-origin:50% 100%}
  .im-frame,.im-hi5{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;object-position:bottom center;opacity:0;transition:opacity .3s ease}
  .im-frame.show,.im-hi5.show{opacity:1}
  .im-hi5{z-index:2}
  `;
  document.head.appendChild(s);
}
