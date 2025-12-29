/**
 * Background Gradient
 * Source: https://ui.aceternity.com/components/background-gradient
 */

"use client";

import { getColorVariable, type DigitalGardenColor } from "@/lib/third-party";
import { cn } from "@/lib/utils";

export interface BackgroundGradientProps {
  className?: string;
  color?: DigitalGardenColor;
  children?: React.ReactNode;
}

export function BackgroundGradient({
  className,
  color = "shale",
  children,
}: BackgroundGradientProps) {
  return (
    <div
      className={cn("relative bg-gradient-to-br", className)}
      style={{
        background: `linear-gradient(to bottom right, ${getColorVariable(color, "dark")}, ${getColorVariable(color, "light")})`,
      }}
    >
      {children}
    </div>
  );
}
