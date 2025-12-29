/**
 * Dotted Glow Background
 * Source: https://www.aceternity.com/components/dotted-glow-background
 *
 * NOTE: This is a placeholder component. To complete integration:
 * 1. Visit the source URL above
 * 2. Copy the component code
 * 3. Replace hardcoded colors with Digital Garden tokens
 * 4. Replace spacing with design tokens
 * 5. Update this file with the adapted code
 */

"use client";

import { getColorVariable, type DigitalGardenColor } from "@/lib/third-party";
import { cn } from "@/lib/utils";

export interface DottedGlowBackgroundProps {
  className?: string;
  color?: DigitalGardenColor;
  children?: React.ReactNode;
}

export function DottedGlowBackground({
  className,
  color = "shale",
  children,
}: DottedGlowBackgroundProps) {
  return (
    <div
      className={cn("relative", className)}
      style={{
        // Example: Use Digital Garden color
        color: getColorVariable(color, "primary"),
      }}
    >
      {children}
      {/* Original Aceternity component code should go here */}
    </div>
  );
}
