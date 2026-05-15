/**
 * Surface Tokens - Liquid Glass
 *
 * Three-tier glass surface system for depth and hierarchy.
 * Used across ALL routes (not just /notes/**).
 *
 * Theme handling: as of the dark-mode epoch, `getSurfaceStyles` returns CSS
 * variable references (e.g. `var(--surface-glass-0-bg)`) rather than fixed
 * rgba values. The variables are defined in globals.css under `:root` (light)
 * and `.dark` (dark). The browser re-evaluates on cascade change, so callers
 * — including server components — automatically respect theme switches
 * without any React re-render or hook plumbing.
 *
 * The `surfaces` / `surfacesDark` objects below remain exported for any
 * non-CSS consumer that needs literal values (e.g. canvas painting). They
 * are NOT used by `getSurfaceStyles` itself.
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

// Dark mode adjustments (kept for direct consumers; not consulted by getSurfaceStyles)
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
 * Get surface styles for a given surface level.
 *
 * Returns CSS-variable references; the browser resolves them per theme via
 * the `.dark` cascade. The legacy `isDark` parameter is accepted for
 * back-compat but ignored — theming is handled by CSS now.
 */
export function getSurfaceStyles(surface: Surface, _isDark: boolean = false) {
  return {
    background: `var(--surface-${surface}-bg)`,
    backdropFilter: `blur(var(--surface-${surface}-blur))`,
    border: `var(--surface-${surface}-border)`,
    boxShadow: `var(--surface-${surface}-shadow)`,
  };
}
