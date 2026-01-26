/**
 * Moving Border
 * Source: https://ui.aceternity.com/components/moving-border
 * Animated border
 */

"use client";

import { getColorVariable, type DigitalGardenColor } from "@/lib/third-party";
import { cn } from "@/lib/core/utils";

export interface MovingBorderProps {
  className?: string;
  color?: DigitalGardenColor;
  children?: React.ReactNode;
}

export function MovingBorder({
  className,
  color = "shale",
  children,
}: MovingBorderProps) {
  return (
    <div
      className={cn("relative rounded-lg", className)}
      style={{
        border: `2px solid ${getColorVariable(color, "primary")}`,
      }}
    >
      {children}
    </div>
  );
}
