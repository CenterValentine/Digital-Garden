/**
 * Spacing conversion utilities for third-party components
 * Converts library spacing values to Digital Garden design system tokens
 * Many libraries use arbitrary values like "12px" or "1rem"
 * This maps them to our semantic spacing scale
 */

/**
 * Converts library spacing values to Digital Garden design system tokens
 */
export const mapSpacing = (value: string | number): string => {
  // If already a CSS variable or design token, return as-is
  if (typeof value === "string" && value.startsWith("var(--")) {
    return value;
  }

  // Map common pixel/rem values to design system tokens
  const spacingMap: Record<string, string> = {
    "4px": "var(--spacing-size-xs)",
    "0.25rem": "var(--spacing-size-xs)",
    "8px": "var(--spacing-size-xs)",
    "0.5rem": "var(--spacing-size-xs)",
    "12px": "var(--spacing-size-sm)",
    "0.75rem": "var(--spacing-size-sm)",
    "16px": "var(--spacing-size-sm)",
    "1rem": "var(--spacing-size-sm)",
    "24px": "var(--spacing-size-md)",
    "1.5rem": "var(--spacing-size-md)",
    "32px": "var(--spacing-size-md)",
    "2rem": "var(--spacing-size-md)",
    "48px": "var(--spacing-size-lg)",
    "3rem": "var(--spacing-size-lg)",
    "64px": "var(--spacing-size-lg)",
    "4rem": "var(--spacing-size-lg)",
  };

  const key = typeof value === "number" ? `${value}px` : value;
  return spacingMap[key] || value;
};

/**
 * Gets spacing token by size name
 */
export const getSpacingToken = (size: "xs" | "sm" | "md" | "lg"): string => {
  const spacingMap = {
    xs: "var(--spacing-size-xs)",
    sm: "var(--spacing-size-sm)",
    md: "var(--spacing-size-md)",
    lg: "var(--spacing-size-lg)",
  };
  return spacingMap[size];
};
