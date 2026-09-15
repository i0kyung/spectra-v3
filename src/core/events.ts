// Minimal, operator-gated, local-only event aggregation.
//
// Hard rules baked in here:
//  - OFF by default; only the operator can enable it.
//  - IDs are per-EXPERIENCE ephemeral tokens, never a durable person/visitor id.
//  - Everything stays in this browser; nothing is uploaded.
//  - Counts are anonymous session counts — NOT unique-visitor or return-rate.

export type SpectraEvent =
  | { sid: string; t: number; type: 'experience_start' }
  | { sid: string; t: number; type: 'experience_end'; durationMs: number; gestures: number }
  | { sid: string; t: number; type: 'gesture'; name: 'highfive'; success: boolean };

const EV_KEY = 'spectra.events.v1';
const EN_KEY = 'spectra.events.enabled';
const RET_KEY = 'spectra.events.retentionDays';

function ls(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

function newSid(): string {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  } catch {
    /* fall through */
  }
  return 'x' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export class EventLog {
  private events: SpectraEvent[] = [];
  private enabled = false;
  private retentionDays = 7;
  private sid: string | null = null;
  private sessionGestures = 0;
  private sessionStart = 0;

  constructor() {
    const s = ls();
    if (s) {
      this.enabled = s.getItem(EN_KEY) === '1';
      const r = Number(s.getItem(RET_KEY));
      if (Number.isFinite(r) && r > 0) this.retentionDays = r;
      try {
        this.events = JSON.parse(s.getItem(EV_KEY) ?? '[]');
      } catch {
        this.events = [];
      }
      this.prune();
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    ls()?.setItem(EN_KEY, on ? '1' : '0');
  }

  setRetentionDays(days: number): void {
    this.retentionDays = Math.max(1, Math.floor(days));
    ls()?.setItem(RET_KEY, String(this.retentionDays));
    this.prune();
  }

  getRetentionDays(): number {
    return this.retentionDays;
  }

  private push(e: SpectraEvent): void {
    if (!this.enabled) return;
    this.events.push(e);
    this.persist();
  }

  startExperience(wall = Date.now()): void {
    if (!this.enabled) return;
    this.sid = newSid();
    this.sessionGestures = 0;
    this.sessionStart = wall;
    this.push({ sid: this.sid, t: wall, type: 'experience_start' });
  }

  gesture(success: boolean, wall = Date.now()): void {
    if (!this.enabled || !this.sid) return;
    this.sessionGestures++;
    this.push({ sid: this.sid, t: wall, type: 'gesture', name: 'highfive', success });
  }

  endExperience(wall = Date.now()): void {
    if (!this.enabled || !this.sid) return;
    this.push({
      sid: this.sid,
      t: wall,
      type: 'experience_end',
      durationMs: Math.max(0, wall - this.sessionStart),
      gestures: this.sessionGestures,
    });
    this.sid = null;
  }

  all(): readonly SpectraEvent[] {
    return this.events;
  }

  /** anonymous session count = number of experience_start events (NOT visitors) */
  sessionCount(): number {
    return this.events.filter((e) => e.type === 'experience_start').length;
  }

  exportJson(): string {
    return JSON.stringify(this.events, null, 2);
  }

  exportCsv(): string {
    const rows = [['sid', 't_iso', 'type', 'detail']];
    for (const e of this.events) {
      let detail = '';
      if (e.type === 'gesture') detail = `${e.name}:${e.success ? 'ok' : 'fail'}`;
      else if (e.type === 'experience_end') detail = `dur=${e.durationMs}ms;gestures=${e.gestures}`;
      rows.push([e.sid, new Date(e.t).toISOString(), e.type, detail]);
    }
    return rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
  }

  clearAll(): void {
    this.events = [];
    this.sid = null;
    ls()?.removeItem(EV_KEY);
  }

  private prune(): void {
    const cutoff = Date.now() - this.retentionDays * 86400_000;
    const before = this.events.length;
    this.events = this.events.filter((e) => e.t >= cutoff);
    if (this.events.length !== before) this.persist();
  }

  private persist(): void {
    ls()?.setItem(EV_KEY, JSON.stringify(this.events));
  }
}
