/**
 * Surface Tokens - Liquid Glass
 *
 * Three-tier glass surface system for depth and hierarchy.
 * Used across ALL routes (not just /notes/**).
 */

export const surfaces = {
  "glass-0": {
    // Base canvas (minimal blur)
    background: "rgba(255, 255, 255, 0.02)",
    backdropBlur: "8px",
    border: "1px solid rgba(255, 255, 255, 0.08)",
    shadow: "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
  },
  "glass-1": {
    // Elevated cards (medium blur)
    background: "rgba(255, 255, 255, 0.04)",
    backdropBlur: "12px",
    border: "1px solid rgba(255, 255, 255, 0.12)",
    shadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
  },
  "glass-2": {
    // Modal overlays (strong blur)
    background: "rgba(255, 255, 255, 0.06)",
    backdropBlur: "16px",
    border: "1px solid rgba(255, 255, 255, 0.16)",
    shadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1)",
  },
} as const;

export type Surface = keyof typeof surfaces;

// Dark mode adjustments
export const surfacesDark = {
  "glass-0": {
    background: "rgba(0, 0, 0, 0.3)",
    border: "1px solid rgba(255, 255, 255, 0.06)",
  },
  "glass-1": {
    background: "rgba(0, 0, 0, 0.4)",
    border: "1px solid rgba(255, 255, 255, 0.08)",
  },
  "glass-2": {
    background: "rgba(0, 0, 0, 0.5)",
    border: "1px solid rgba(255, 255, 255, 0.12)",
  },
} as const;

/**
 * Get surface styles for a given surface level
 */
export function getSurfaceStyles(surface: Surface, isDark: boolean = false) {
  const base = surfaces[surface];
  const dark = isDark ? surfacesDark[surface] : null;

  return {
    background: dark?.background || base.background,
    backdropFilter: `blur(${base.backdropBlur})`,
    border: dark?.border || base.border,
    boxShadow: base.shadow,
  };
}
