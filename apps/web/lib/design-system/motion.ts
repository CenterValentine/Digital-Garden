/**
 * Motion Rules - Conservative
 *
 * Restrained animations for professional IDE experience.
 */

export const motion = {
  durations: {
    fast: 150, // ms
    base: 200,
    slow: 300,
  },

  easings: {
    smooth: "cubic-bezier(0.4, 0, 0.2, 1)", // ease-out
    snappy: "cubic-bezier(0.4, 0, 0.6, 1)", // custom snap
  },

  // Allowed transforms
  allowed: {
    opacity: true,
    translateX: true,
    translateY: true,
    scale: { min: 0.95, max: 1.05 }, // Subtle only
  },

  // Banned transforms
  banned: {
    rotate: true, // Except icon spin
    skew: true,
    dropShadow: true, // Except icons
    glow: true,
  },
} as const;

/**
 * CSS transition helper
 */
export function transition(
  property: string | string[],
  duration: keyof typeof motion.durations = "base",
  easing: keyof typeof motion.easings = "smooth"
): string {
  const props = Array.isArray(property) ? property.join(", ") : property;
  return `${props} ${motion.durations[duration]}ms ${motion.easings[easing]}`;
}

/**
 * Get transition classes for Tailwind
 */
export function getTransitionClasses(
  properties: string[] = ["all"],
  duration: keyof typeof motion.durations = "base"
): string {
  const durationClass =
    duration === "fast"
      ? "duration-150"
      : duration === "slow"
        ? "duration-300"
        : "duration-200";

  return `transition-${properties.join("-")} ${durationClass} ease-out`;
}
