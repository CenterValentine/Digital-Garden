/**
 * David's Digital Garden Color Palette
 * Centralized color definitions for the design system
 *
 * Usage:
 * - Import colors from this file instead of using hex values directly
 * - For Tailwind classes, use the tokens (e.g., bg-shale-dark, text-gold-primary)
 * - For inline styles/SVG, use these constants
 */

// Slate Palette (Depth/Connection) - renamed from Shale
export const SLATE = {
  dark: "#465E73",
  mid: "#5A7288",
  light: "#6E869D",
} as const;

// Gold Palette (Knowledge/Foundation)
export const GOLD = {
  primary: "#C9A86C",
  dark: "#B8965A",
  light: "#D9B87E",
} as const;

// Leaf Palette (Growth/Success) - using analogous harmony
export const LEAF = {
  primary: "#49A657",
  light: "#6BC578", // Yellow-green (analogous)
  bright: "#8FE39A", // Brighter yellow-green
} as const;

// Semantic Intent Colors
export const INTENT = {
  primary: LEAF.primary,
  secondary: GOLD.primary,
  accent: SLATE.mid,
  danger: "#E57373",
  neutral: SLATE.light,
} as const;

// Neon Node Palettes - Bright, vibrant colors using triadic harmony
// Based on triadic relationships of main palette colors

// Neon Palette 1: Blue-Slate Triadic (Blue-Slate, Red-Orange, Yellow-Green)
export const NEON_BLUE = {
  primary: "#00D4FF", // Bright cyan-blue (triadic from slate)
  secondary: "#FF6B35", // Bright red-orange (triadic)
  accent: "#7FFF00", // Bright yellow-green (triadic)
  dark: "#0099CC",
  light: "#33E0FF",
} as const;

// Neon Palette 2: Gold Triadic (Gold, Blue, Red)
export const NEON_GOLD = {
  primary: "#FFD700", // Bright gold (enhanced from base gold)
  secondary: "#00BFFF", // Bright blue (triadic)
  accent: "#FF1493", // Bright pink-red (triadic)
  dark: "#FFA500",
  light: "#FFE44D",
} as const;

// Neon Palette 3: Green Triadic (Green, Orange, Purple)
export const NEON_GREEN = {
  primary: "#00FF7F", // Bright spring green (enhanced from leaf)
  secondary: "#FF8C00", // Bright orange (triadic)
  accent: "#9370DB", // Bright purple (triadic)
  dark: "#00CC66",
  light: "#33FF99",
} as const;

// Branch node colors for navigation tree
// Uses neon palettes organized by vertical position zones
export const BRANCH_COLORS = {
  // Top zone (0-33%) - Neon Green palette
  top: {
    primary: NEON_GREEN.primary,
    secondary: NEON_GREEN.secondary,
    accent: NEON_GREEN.accent,
  },
  // Middle zone (33-66%) - Neon Blue palette
  middle: {
    primary: NEON_BLUE.primary,
    secondary: NEON_BLUE.secondary,
    accent: NEON_BLUE.accent,
  },
  // Bottom zone (66-100%) - Neon Gold palette
  bottom: {
    primary: NEON_GOLD.primary,
    secondary: NEON_GOLD.secondary,
    accent: NEON_GOLD.accent,
  },
} as const;

/**
 * Get branch color based on vertical position
 * Maps to one of three neon palettes, cycling through primary/secondary/accent within each zone
 * @param yPercent - Vertical position (0-100)
 * @returns Hex color for that position
 */
export function getBranchColor(yPercent: number): string {
  // Determine which neon palette zone (0-33%, 33-66%, 66-100%)
  if (yPercent < 33.33) {
    // Top zone - Neon Green
    const subPosition = (yPercent / 33.33) * 100; // 0-100 within this zone
    if (subPosition < 33.33) return BRANCH_COLORS.top.primary;
    if (subPosition < 66.66) return BRANCH_COLORS.top.secondary;
    return BRANCH_COLORS.top.accent;
  } else if (yPercent < 66.66) {
    // Middle zone - Neon Blue
    const subPosition = ((yPercent - 33.33) / 33.33) * 100; // 0-100 within this zone
    if (subPosition < 33.33) return BRANCH_COLORS.middle.primary;
    if (subPosition < 66.66) return BRANCH_COLORS.middle.secondary;
    return BRANCH_COLORS.middle.accent;
  } else {
    // Bottom zone - Neon Gold
    const subPosition = ((yPercent - 66.66) / 33.34) * 100; // 0-100 within this zone
    if (subPosition < 33.33) return BRANCH_COLORS.bottom.primary;
    if (subPosition < 66.66) return BRANCH_COLORS.bottom.secondary;
    return BRANCH_COLORS.bottom.accent;
  }
}

// Export all colors for convenience
export const COLORS = {
  slate: SLATE,
  gold: GOLD,
  leaf: LEAF,
  intent: INTENT,
  branch: BRANCH_COLORS,
  neonBlue: NEON_BLUE,
  neonGold: NEON_GOLD,
  neonGreen: NEON_GREEN,
} as const;

export default COLORS;
