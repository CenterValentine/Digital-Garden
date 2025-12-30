/**
 * Animation configuration utilities for third-party components
 * Provides consistent animation timing and easing across third-party components
 */

export const animationConfig = {
  duration: {
    fast: 150,
    normal: 300,
    slow: 500,
    slower: 750,
    slowest: 1000,
  },
  easing: {
    default: "cubic-bezier(0.4, 0, 0.2, 1)",
    in: "cubic-bezier(0.4, 0, 1, 1)",
    out: "cubic-bezier(0, 0, 0.2, 1)",
    inOut: "cubic-bezier(0.4, 0, 0.2, 1)",
    spring: "cubic-bezier(0.68, -0.55, 0.265, 1.55)",
  },
};

/**
 * Creates animation style object for inline styles
 */
export const createAnimation = (
  duration: keyof typeof animationConfig.duration = "normal",
  easing: keyof typeof animationConfig.easing = "default"
): { transition: string } => ({
  transition: `all ${animationConfig.duration[duration]}ms ${animationConfig.easing[easing]}`,
});

/**
 * Creates transition string for CSS
 */
export const createTransition = (
  properties: string[] = ["all"],
  duration: keyof typeof animationConfig.duration = "normal",
  easing: keyof typeof animationConfig.easing = "default"
): string => {
  const durationMs = animationConfig.duration[duration];
  const easingValue = animationConfig.easing[easing];
  return properties
    .map((prop) => `${prop} ${durationMs}ms ${easingValue}`)
    .join(", ");
};

/**
 * Common animation variants for framer-motion
 */
export const motionVariants = {
  fadeIn: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
  },
  slideUp: {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: 20 },
  },
  slideDown: {
    initial: { opacity: 0, y: -20 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -20 },
  },
  scale: {
    initial: { opacity: 0, scale: 0.95 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.95 },
  },
};
