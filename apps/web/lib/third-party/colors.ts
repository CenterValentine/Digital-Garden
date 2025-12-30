/**
 * Color mapping utilities for third-party components
 * Maps Digital Garden color names to CSS variable values
 * Used when third-party components need color values as strings
 */

export type DigitalGardenColor =
  | "shale"
  | "gold"
  | "leaf"
  | "neon-blue"
  | "neon-gold"
  | "neon-green";

export type ColorVariant =
  | "dark"
  | "mid"
  | "light"
  | "primary"
  | "secondary"
  | "accent"
  | "bright";

/**
 * Maps Digital Garden color names to CSS variable values
 * Used when third-party components need color values as strings
 */
export const getColorVariable = (
  colorName: DigitalGardenColor,
  variant: ColorVariant = "primary"
): string => {
  const colorMap: Record<
    DigitalGardenColor,
    Partial<Record<ColorVariant, string>>
  > = {
    shale: {
      dark: "var(--shale-dark)",
      mid: "var(--shale-mid)",
      light: "var(--shale-light)",
    },
    gold: {
      primary: "var(--gold-primary)",
      dark: "var(--gold-dark)",
      light: "var(--gold-light)",
    },
    leaf: {
      primary: "var(--leaf-primary)",
      light: "var(--leaf-light)",
      bright: "var(--leaf-bright)",
    },
    "neon-blue": {
      primary: "var(--neon-blue-primary)",
      secondary: "var(--neon-blue-secondary)",
      accent: "var(--neon-blue-accent)",
      dark: "var(--neon-blue-dark)",
      light: "var(--neon-blue-light)",
    },
    "neon-gold": {
      primary: "var(--neon-gold-primary)",
      secondary: "var(--neon-gold-secondary)",
      accent: "var(--neon-gold-accent)",
      dark: "var(--neon-gold-dark)",
      light: "var(--neon-gold-light)",
    },
    "neon-green": {
      primary: "var(--neon-green-primary)",
      secondary: "var(--neon-green-secondary)",
      accent: "var(--neon-green-accent)",
      dark: "var(--neon-green-dark)",
      light: "var(--neon-green-light)",
    },
  };

  const color = colorMap[colorName];
  if (!color) {
    return "var(--shale-primary)"; // fallback
  }

  // Try to get the requested variant, fallback to primary or first available
  return (
    color[variant] ||
    color.primary ||
    Object.values(color)[0] ||
    "var(--shale-primary)"
  );
};

/**
 * Gets intent-based colors (for semantic use)
 */
export const getIntentColor = (
  intent: "primary" | "secondary" | "accent" | "danger" | "warning" | "neutral"
): string => {
  return `var(--intent-${intent})`;
};

/**
 * Gets surface colors (backgrounds, cards, overlays)
 */
export const getSurfaceColor = (
  surface: "default" | "elevated" | "overlay"
): string => {
  const surfaceMap = {
    default: "var(--background)",
    elevated: "var(--card)",
    overlay: "var(--surface-overlay)",
  };
  return surfaceMap[surface] || surfaceMap.default;
};

/**
 * Gets state colors (hover, focus, active, disabled)
 */
export const getStateColor = (
  state: "hover" | "focus" | "active" | "disabled"
): string => {
  const stateMap = {
    hover: "var(--state-hover)",
    focus: "var(--state-focus)",
    active: "var(--state-active)",
    disabled: "var(--state-disabled)",
  };
  return stateMap[state] || stateMap.hover;
};
