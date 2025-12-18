/**
 * David's Digital Garden Color Palette
 * Centralized color definitions for the design system
 *
 * Usage:
 * - Import colors from this file instead of using hex values directly
 * - For Tailwind classes, use the tokens (e.g., bg-teal-dark, text-gold-primary)
 * - For inline styles/SVG, use these constants
 */

// Teal Palette (Depth/Connection)
export const TEAL = {
  dark: "#3D5A5B",
  mid: "#5A7A7A",
  light: "#7A9A9A",
} as const;

// Gold Palette (Knowledge/Foundation)
export const GOLD = {
  primary: "#C9A86C",
  dark: "#8B7355",
  light: "#E5D4B0",
} as const;

// Leaf Palette (Growth/Success)
export const LEAF = {
  primary: "#4CAF50",
  light: "#81C784",
  bright: "#A5D6A7",
} as const;

// Semantic Intent Colors
export const INTENT = {
  primary: LEAF.primary,
  secondary: GOLD.primary,
  accent: TEAL.mid,
  danger: "#E57373",
  neutral: TEAL.light,
} as const;

// Branch node colors for navigation tree
// Maps to vertical position (yPercent) along the tree
export const BRANCH_COLORS = {
  top: LEAF.primary, // 0-40% - Growth zone
  middle: TEAL.mid, // 40-60% - Connection zone
  lowerMiddle: GOLD.primary, // 60-70% - Knowledge zone
  bottom: GOLD.dark, // 70-100% - Foundation zone
} as const;

/**
 * Get branch color based on vertical position
 * @param yPercent - Vertical position (0-100)
 * @returns Hex color for that position
 */
export function getBranchColor(yPercent: number): string {
  if (yPercent < 40) return BRANCH_COLORS.top;
  if (yPercent < 60) return BRANCH_COLORS.middle;
  if (yPercent < 70) return BRANCH_COLORS.lowerMiddle;
  return BRANCH_COLORS.bottom;
}

// Gradient definitions (CSS gradient strings)
export const GRADIENTS = {
  teal: "linear-gradient(to bottom, #7A9A9A, #5A7A7A, #3D5A5B)",
  gold: "linear-gradient(to bottom, #E5D4B0, #C9A86C, #8B7355)",
  leaf: "linear-gradient(to bottom, #A5D6A7, #81C784, #4CAF50)",
  mixed: "linear-gradient(to bottom, #E5D4B0, #5A7A7A, #3D5A5B)",
  tealToGold: "linear-gradient(to right, #3D5A5B, #C9A86C)",
  goldToLeaf: "linear-gradient(to right, #C9A86C, #4CAF50)",
} as const;

// Export all colors for convenience
export const COLORS = {
  teal: TEAL,
  gold: GOLD,
  leaf: LEAF,
  intent: INTENT,
  branch: BRANCH_COLORS,
  gradients: GRADIENTS,
} as const;

export default COLORS;
