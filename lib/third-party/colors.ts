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

/**
 * Convert CSS variable to hex string
 * Used for Canvas API components that need hex colors
 */
export const cssVarToHex = (
  cssVar: string,
  fallback: string = "#737373"
): string => {
  if (typeof window === "undefined" || !document.body) return fallback;

  try {
    const tempEl = document.createElement("div");
    tempEl.style.color = cssVar;
    tempEl.style.position = "absolute";
    tempEl.style.visibility = "hidden";
    document.body.appendChild(tempEl);
    const computed = window.getComputedStyle(tempEl).color;
    document.body.removeChild(tempEl);

    const match = computed.match(/\d+/g);
    if (Array.isArray(match) && match.length >= 3) {
      const [r, g, b] = match.slice(0, 3).map(Number);
      return `#${[r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
    }
  } catch {
    console.warn("Failed to convert CSS variable to hex:", cssVar);
    return fallback;
  }

  return fallback;
};

/**
 * Convert CSS variable to RGB array
 * Used for Canvas API components that need RGB arrays
 */
export const cssVarToRgb = (
  cssVar: string,
  fallback: [number, number, number] = [115, 115, 115]
): [number, number, number] => {
  if (typeof window === "undefined" || !document.body) return fallback;

  try {
    const tempEl = document.createElement("div");
    tempEl.style.color = cssVar;
    tempEl.style.position = "absolute";
    tempEl.style.visibility = "hidden";
    document.body.appendChild(tempEl);
    const computed = window.getComputedStyle(tempEl).color;
    document.body.removeChild(tempEl);

    const match = computed.match(/\d+/g);
    if (Array.isArray(match) && match.length >= 3) {
      const [r, g, b] = match.slice(0, 3).map(Number);
      return [r, g, b] as [number, number, number];
    }
  } catch {
    console.warn("Failed to convert CSS variable to RGB:", cssVar);
    return fallback;
  }

  return fallback;
};

/**
 * Get Digital Garden color as hex string
 * Convenience function for Canvas components
 */
export const getColorAsHex = (
  color: DigitalGardenColor,
  variant: ColorVariant = "primary"
): string => {
  return cssVarToHex(getColorVariable(color, variant));
};

/**
 * Get Digital Garden color as RGB array
 * Convenience function for Canvas components
 */
export const getColorAsRgb = (
  color: DigitalGardenColor,
  variant: ColorVariant = "primary"
): [number, number, number] => {
  return cssVarToRgb(getColorVariable(color, variant));
};

/**
 * Convert hex string to HSL string
 * Used for components that need HSL color format (e.g., fireworks)
 */
export const hexToHsl = (hex: string): string => {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }

  h = Math.round(h * 360);
  s = Math.round(s * 100);
  const lightness = Math.round(l * 100);

  return `hsl(${h}, ${s}%, ${lightness}%)`;
};

/**
 * Get Digital Garden color as HSL string
 * Convenience function for components that need HSL format
 */
export const getColorAsHsl = (
  color: DigitalGardenColor,
  variant: ColorVariant = "primary"
): string => {
  return hexToHsl(getColorAsHex(color, variant));
};
