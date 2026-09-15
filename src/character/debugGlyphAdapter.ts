import type { CharacterAdapter } from './adapter';
import type { Expression, GestureName, ProximityBand, Vec2 } from '../types';

interface GestureAnim {
  name: GestureName;
  start: number;
  dur: number;
}

/**
 * A simple, code-drawn character whose EYES and FACING are unambiguous, used to
 * verify look-direction and state visually. It is explicitly a TEST character
 * (labelled on screen) and is NOT the finished 민경/Moa model.
 */
export class DebugGlyphAdapter implements CharacterAdapter {
  readonly name = 'DebugGlyph (테스트 캐릭터)';
  readonly isDebug = true;

  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private ro?: ResizeObserver;
  private look: Vec2 = { x: 0, y: 0 };
  private disp: Vec2 = { x: 0, y: 0 };
  private expression: Expression = 'neutral';
  private proxT = 1;
  private prox = 1;
  private gesture: GestureAnim | null = null;
  private color = '#63E6FF';

  async mount(container: HTMLElement): Promise<void> {
    this.canvas = document.createElement('canvas');
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.display = 'block';
    container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const r = container.getBoundingClientRect();
      this.canvas.width = Math.max(1, Math.round(r.width * dpr));
      this.canvas.height = Math.max(1, Math.round(r.height * dpr));
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    this.ro = new ResizeObserver(resize);
    this.ro.observe(container);
  }

  lookAt(v: Vec2): void {
    this.look = v;
  }
  setExpression(e: Expression): void {
    this.expression = e;
  }
  playGesture(g: GestureName): void {
    this.gesture = { name: g, start: performance.now(), dur: g === 'highfive' ? 1300 : 900 };
  }
  setProximity(band: ProximityBand): void {
    this.proxT = band === 'near' ? 1.08 : 1.0;
  }
  setSignatureColor(color: string): void {
    this.color = color;
  }

  update(dtMs: number, now: number): void {
    const a = 1 - Math.exp(-dtMs / 90);
    this.disp.x += (this.look.x - this.disp.x) * a;
    this.disp.y += (this.look.y - this.disp.y) * a;
    this.prox += (this.proxT - this.prox) * (1 - Math.exp(-dtMs / 160));

    const c = this.ctx;
    const w = this.canvas.clientWidth || this.canvas.width;
    const h = this.canvas.clientHeight || this.canvas.height;
    c.clearRect(0, 0, w, h);

    const cx = w / 2 + this.disp.x * w * 0.06;
    const R = Math.min(w, h) * 0.22 * this.prox;
    const breathe = Math.sin(now / 1000 * 1.5) * R * 0.02;

    let popY = 0;
    let armRaise = 0;
    if (this.gesture) {
      const p = (now - this.gesture.start) / this.gesture.dur;
      if (p >= 1) this.gesture = null;
      else {
        const env = Math.sin(p * Math.PI);
        popY = -R * 0.18 * env;
        if (this.gesture.name === 'highfive') armRaise = env;
      }
    }
    const cy = h * 0.52 + this.disp.y * h * 0.05 + breathe + popY;

    // signature ground glow
    const grd = c.createRadialGradient(cx, cy + R * 1.2, 0, cx, cy + R * 1.2, R * 2);
    grd.addColorStop(0, this.color + '33');
    grd.addColorStop(1, 'transparent');
    c.fillStyle = grd;
    c.fillRect(0, 0, w, h);

    // head
    c.save();
    c.translate(cx, cy);
    c.rotate(this.disp.x * 0.12);
    c.fillStyle = '#F4E7D6';
    c.strokeStyle = this.color;
    c.lineWidth = Math.max(2, R * 0.05);
    circle(c, 0, 0, R, true, true);

    // eyes
    const eyeDX = R * 0.42;
    const eyeDY = -R * 0.12;
    const eyeR = R * 0.2;
    const pupR = R * 0.09;
    const px = this.disp.x * eyeR * 0.55;
    const py = this.disp.y * eyeR * 0.55;
    for (const sx of [-1, 1]) {
      c.fillStyle = '#fff';
      circle(c, sx * eyeDX, eyeDY, eyeR, true, false);
      c.fillStyle = '#26123a';
      circle(c, sx * eyeDX + px, eyeDY + py, pupR, true, false);
      c.fillStyle = '#ffffffaa';
      circle(c, sx * eyeDX + px - pupR * 0.3, eyeDY + py - pupR * 0.3, pupR * 0.3, true, false);
    }

    // brows per expression
    c.strokeStyle = '#3a2a12';
    c.lineWidth = R * 0.06;
    c.lineCap = 'round';
    drawBrows(c, this.expression, eyeDX, eyeDY - eyeR * 1.15, eyeR);

    // nose = FACING pointer (unambiguous direction cue)
    c.fillStyle = this.color;
    const nx = this.disp.x * R * 0.25;
    triangle(c, nx, R * 0.05, R * 0.09);

    // mouth per expression
    drawMouth(c, this.expression, 0, R * 0.42, R);
    c.restore();

    // raised arm for high five
    if (armRaise > 0) {
      c.strokeStyle = '#F4E7D6';
      c.lineWidth = R * 0.16;
      c.lineCap = 'round';
      const sx = cx + R * 0.9;
      const sy = cy + R * 0.4;
      c.beginPath();
      c.moveTo(sx, sy);
      c.lineTo(sx + R * 0.2, sy - R * (0.5 + 0.6 * armRaise));
      c.stroke();
      c.fillStyle = '#F4E7D6';
      circle(c, sx + R * 0.2, sy - R * (0.5 + 0.6 * armRaise), R * 0.16, true, false);
    }

    // TEST label
    c.fillStyle = this.color;
    c.font = `700 ${Math.max(11, R * 0.14)}px system-ui, sans-serif`;
    c.textAlign = 'center';
    c.fillText('● 테스트 캐릭터 · TEST GLYPH', cx, cy - R * 1.7);
  }

  dispose(): void {
    this.ro?.disconnect();
    this.canvas?.remove();
  }
}

function circle(c: CanvasRenderingContext2D, x: number, y: number, r: number, fill: boolean, stroke: boolean): void {
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  if (fill) c.fill();
  if (stroke) c.stroke();
}
function triangle(c: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  c.beginPath();
  c.moveTo(x, y - s);
  c.lineTo(x - s, y + s);
  c.lineTo(x + s, y + s);
  c.closePath();
  c.fill();
}
function drawBrows(c: CanvasRenderingContext2D, e: Expression, dx: number, y: number, r: number): void {
  for (const sx of [-1, 1]) {
    c.beginPath();
    if (e === 'angry') {
      c.moveTo(sx * dx - r * 0.6, y - r * 0.15 * sx * -1);
      c.lineTo(sx * dx + r * 0.6, y + r * 0.35 * (sx === -1 ? 1 : 1));
    } else if (e === 'sad' || e === 'cry') {
      c.moveTo(sx * dx - r * 0.6, y + r * 0.25);
      c.lineTo(sx * dx + r * 0.6, y - r * 0.1);
    } else {
      c.moveTo(sx * dx - r * 0.55, y);
      c.lineTo(sx * dx + r * 0.55, y - r * 0.1);
    }
    c.stroke();
  }
}
function drawMouth(c: CanvasRenderingContext2D, e: Expression, x: number, y: number, R: number): void {
  c.strokeStyle = '#8a3b2e';
  c.fillStyle = '#8a3b2e';
  c.lineWidth = R * 0.05;
  c.lineCap = 'round';
  c.beginPath();
  const w = R * 0.5;
  switch (e) {
    case 'happy':
    case 'playful':
      c.arc(x, y - R * 0.05, w, 0.1 * Math.PI, 0.9 * Math.PI);
      c.stroke();
      break;
    case 'sad':
    case 'cry':
      c.arc(x, y + R * 0.35, w, 1.15 * Math.PI, 1.85 * Math.PI);
      c.stroke();
      if (e === 'cry') {
        c.fillStyle = '#63b3ff';
        circle(c, -R * 0.42, y - R * 0.4, R * 0.06, true, false);
      }
      break;
    case 'angry':
      c.moveTo(x - w * 0.6, y);
      c.lineTo(x + w * 0.6, y);
      c.stroke();
      break;
    default: // neutral
      c.arc(x, y, w * 0.7, 0.15 * Math.PI, 0.85 * Math.PI);
      c.stroke();
  }
}
