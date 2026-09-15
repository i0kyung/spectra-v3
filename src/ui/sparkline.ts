// A tiny rolling sparkline for the operator panel (FPS, latency, …).
export class Sparkline {
  private ctx: CanvasRenderingContext2D;
  private data: number[] = [];
  constructor(
    private canvas: HTMLCanvasElement,
    private color: string,
    private max: number,
    private cap = 120,
  ) {
    this.ctx = canvas.getContext('2d')!;
  }

  setColor(c: string): void {
    this.color = c;
  }

  push(v: number): void {
    this.data.push(v);
    if (this.data.length > this.cap) this.data.shift();
    this.draw();
  }

  private draw(): void {
    const c = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    c.clearRect(0, 0, w, h);
    if (this.data.length < 2) return;
    const max = Math.max(this.max, ...this.data) * 1.1;
    c.strokeStyle = this.color;
    c.lineWidth = 1.5;
    c.beginPath();
    this.data.forEach((v, i) => {
      const x = (i / (this.cap - 1)) * w;
      const y = h - (Math.min(v, max) / max) * h;
      if (i === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    });
    c.stroke();
    // baseline fill
    c.lineTo((((this.data.length - 1) / (this.cap - 1)) * w), h);
    c.lineTo(0, h);
    c.closePath();
    c.globalAlpha = 0.12;
    c.fillStyle = this.color;
    c.fill();
    c.globalAlpha = 1;
  }
}
