/**
 * woodRings.ts — organic tree-ring geometry for the Résumé page.
 *
 * Each career entry renders as a cross-section of trunk: the more years on
 * record, the more cumulative rings. The rings must read as *organic, irregular
 * loops* — not perfect circles — so `organicPath()` perturbs each radius with a
 * sum of low-frequency sines (a cheap 1-D noise) and stitches the points with
 * Catmull-Rom-style cubic béziers for a smooth, hand-grown contour.
 *
 * Pure module (no React) so it is safe to import anywhere. The `<WoodRings />`
 * component in [components/personal/WoodRings.tsx] consumes it.
 */

/**
 * Build an SVG path string for one organic ring.
 *
 * @param cx   centre x
 * @param cy   centre y
 * @param r    base radius
 * @param seed per-ring phase offset so rings don't share the same wobble
 */
export function organicPath(
  cx: number,
  cy: number,
  r: number,
  seed: number,
): string {
  const n = 72;
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2 - Math.PI / 2;
    const j =
      r *
      (Math.sin(t * 2 + seed) * 0.028 +
        Math.sin(t * 5 + seed * 1.618) * 0.016 +
        Math.sin(t * 9 + seed * 2.718) * 0.009 +
        Math.sin(t * 13 + seed * 4.1) * 0.005);
    pts.push([cx + (r + j) * Math.cos(t), cy + (r + j) * Math.sin(t)]);
  }
  let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const a = pts[(i + 1) % n];
    const b = pts[(i + 2) % n];
    const pp = pts[(i - 1 + n) % n];
    const c1x = p[0] + (a[0] - pp[0]) / 6;
    const c1y = p[1] + (a[1] - pp[1]) / 6;
    const c2x = a[0] - (b[0] - p[0]) / 6;
    const c2y = a[1] - (b[1] - p[1]) / 6;
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${a[0].toFixed(1)} ${a[1].toFixed(1)}`;
  }
  return d + "Z";
}

/** Wood-tone fills, outermost (newest era) → heartwood (oldest). */
export const RING_FILLS = ["#e6cc9e", "#d8b476", "#c49444", "#b07830"] as const;
/** Matching ring strokes. */
export const RING_STROKES = ["#c8a252", "#b0822a", "#946018", "#7a4c10"] as const;
/** Centre pith dot. */
export const PITH_FILL = "#8a5218";

export interface WoodRingConfig {
  /** Outermost first; length = number of eras this entry has lived through. */
  radii: number[];
  cx: number;
  cy: number;
  width: number;
  height: number;
}

/** Header medallion shows all four rings at large scale. */
export const HEADER_RING_CONFIG: WoodRingConfig = {
  radii: [88, 65, 42, 18],
  cx: 95,
  cy: 95,
  width: 190,
  height: 190,
};

/**
 * Per-entry ring configs, newest → oldest. Entry 4 (now) shows 4 rings;
 * entry 1 (heartwood / first role) shows a single ring.
 */
export const ENTRY_RING_CONFIGS: WoodRingConfig[] = [
  { radii: [50, 37, 23, 10], cx: 55, cy: 55, width: 110, height: 110 },
  { radii: [50, 37, 23], cx: 55, cy: 55, width: 110, height: 110 },
  { radii: [50, 37], cx: 55, cy: 55, width: 110, height: 110 },
  { radii: [50], cx: 55, cy: 55, width: 110, height: 110 },
];
