import type { Config } from './types';

// Initial TUNING values, not field-validated specs. Every one of these is
// exposed to the operator and is expected to change per venue / lighting / lens.
export const DEFAULT_CONFIG: Config = {
  roi: { x: 0.2, y: 0.1, w: 0.6, h: 0.85 },
  dwellMs: 700,
  centerWeight: 0.65,
  stealMargin: 0.25,

  trackMatchDist: 0.16,
  trackTtlMs: 500,
  trackPredict: true,

  graceMs: 1500,
  reacquireDist: 0.18,

  flipX: true, // selfie cameras are mirrored by default
  flipY: false,
  gazeGain: 1.35,
  gazeDeadzone: 0.015,
  gazeMaxX: 1,
  gazeMaxY: 0.7,
  gazeSmoothMs: 140,

  nearEnter: 0.34,
  nearExit: 0.28,

  // high five — loosened so a real raised hand triggers reliably on webcam
  handAssocRadius: 0.5,
  handAmbiguityMargin: 0.06,
  palmOpenMin: 0.4,
  raiseLineY: 0.8,
  highFiveHoldMs: 200,
  highFiveCooldownMs: 2200,

  usePoseFusion: false,
  useWorker: true,
  particles: true,

  greetingMs: 900,
  farewellMs: 1400,
  signatureColor: '#63E6FF',
};

// bumped for v1.2 so returning visitors pick up the new (looser high-five) defaults
const KEY = 'spectra.config.v1_2';

export function loadConfig(): Config {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULT_CONFIG);
    const parsed = JSON.parse(raw) as Partial<Config>;
    // shallow-merge so new fields in a newer build fall back to defaults
    return { ...structuredClone(DEFAULT_CONFIG), ...parsed, roi: { ...DEFAULT_CONFIG.roi, ...(parsed.roi ?? {}) } };
  } catch {
    return structuredClone(DEFAULT_CONFIG);
  }
}

export function saveConfig(cfg: Config): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(cfg));
  } catch {
    /* storage may be unavailable (private mode) — non-fatal */
  }
}

export function resetConfig(): Config {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  return structuredClone(DEFAULT_CONFIG);
}
