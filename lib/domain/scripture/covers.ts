/**
 * Cover designs for scripture volumes (client-safe).
 *
 * Drawn, not copied: official cover artwork (e.g. the Church's editions) is
 * someone else's design, so each volume gets our own bound-book cover — a
 * leather tone and gold lettering, the way the printed standard works look on
 * a shelf. A tradition sets tones for its volumes here; anything unlisted gets
 * a stable tone from its slug.
 */

export interface VolumeCoverStyle {
  /** Leather base color. */
  leather: string;
  /** Lettering / border foil. */
  foil: string;
}

const GOLD = "#d6b56a";

const VOLUME_TONES: Record<string, string> = {
  // LDS standard works
  ot: "#4a3222", // tan-brown leather
  nt: "#2f3441", // slate
  bofm: "#1f2b47", // navy
  "dc-testament": "#4a2029", // burgundy
  pgp: "#1f3d35", // deep green
};

const FALLBACK_TONES = ["#3d2b22", "#27324a", "#43252c", "#233a33", "#3a3346", "#403722"];

function hash(text: string): number {
  let value = 0;
  for (const char of text) value = (value * 31 + char.charCodeAt(0)) >>> 0;
  return value;
}

export function volumeCover(slug: string): VolumeCoverStyle {
  return {
    leather: VOLUME_TONES[slug] ?? FALLBACK_TONES[hash(slug) % FALLBACK_TONES.length],
    foil: GOLD,
  };
}
