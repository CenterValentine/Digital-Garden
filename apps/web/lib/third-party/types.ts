/**
 * Shared TypeScript types for third-party component props
 * Ensures consistent interfaces across all integrated components
 */

import type { DigitalGardenColor } from "./colors";

export type DigitalGardenIntent =
  | "primary"
  | "secondary"
  | "accent"
  | "danger"
  | "warning"
  | "neutral";

export type DigitalGardenSize = "xs" | "sm" | "md" | "lg";

/**
 * Base props that all adapted third-party components should accept
 */
export interface DigitalGardenComponentProps {
  className?: string;
  color?: DigitalGardenColor;
  intent?: DigitalGardenIntent;
  size?: DigitalGardenSize;
}

/**
 * Extended props for components that support animations
 */
export interface AnimatedComponentProps extends DigitalGardenComponentProps {
  animate?: boolean;
  animationDuration?: "fast" | "normal" | "slow" | "slower" | "slowest";
}

/**
 * Props for components that accept children
 */
export interface ComponentWithChildren extends DigitalGardenComponentProps {
  children?: React.ReactNode;
}
