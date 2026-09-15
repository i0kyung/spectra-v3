// Lightweight full-screen particle burst for the viewer (high-five FX).
// Self-contained: it runs its own rAF only while particles are alive, then idles.
interface P {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  r: number;
}

export class Particles {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private ps: P[] = [];
  private raf = 0;
  private color = '#63E6FF';
  private last = 0;

  constructor(parent: HTMLElement) {
    this.canvas = document.createElement('canvas');
    Object.assign(this.canvas.style, {
      position: 'fixed',
      inset: '0',
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
      zIndex: '4',
    } as CSSStyleDeclaration);
    parent.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  setColor(c: string): void {
    this.color = c;
  }

  private resize(): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(innerWidth * dpr);
    this.canvas.height = Math.round(innerHeight * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /** burst at a fraction of the viewport (default centre-upper) */
  burst(fx = 0.5, fy = 0.42, n = 34): void {
    const x = fx * innerWidth;
    const y = fy * innerHeight;
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * i) / n + Math.random() * 0.3;
      const sp = 180 + Math.random() * 260;
      this.ps.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60, life: 1, r: 3 + Math.random() * 5 });
    }
    if (!this.raf) {
      this.last = performance.now();
      this.raf = requestAnimationFrame((t) => this.step(t));
    }
  }

  private step(t: number): void {
    const dt = Math.min(0.05, (t - this.last) / 1000);
    this.last = t;
    const c = this.ctx;
    c.clearRect(0, 0, innerWidth, innerHeight);
    c.fillStyle = this.color;
    for (const p of this.ps) {
      p.life -= dt * 1.4;
      p.vy += 520 * dt; // gravity
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.life <= 0) continue;
      c.globalAlpha = Math.max(0, p.life);
      c.beginPath();
      c.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2);
      c.fill();
    }
    c.globalAlpha = 1;
    this.ps = this.ps.filter((p) => p.life > 0);
    if (this.ps.length) {
      this.raf = requestAnimationFrame((tt) => this.step(tt));
    } else {
      this.raf = 0;
      c.clearRect(0, 0, innerWidth, innerHeight);
    }
  }
}
