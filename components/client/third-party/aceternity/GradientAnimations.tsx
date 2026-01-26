/**
 * Gradient Animations
 * Source: https://ui.aceternity.com/components/gradient-animations
 */

"use client";

import { getColorVariable, type DigitalGardenColor } from "@/lib/design/integrations";
import { cn } from "@/lib/core/utils";

export interface GradientAnimationsProps {
  className?: string;
  color?: DigitalGardenColor;
  children?: React.ReactNode;
}

export function GradientAnimations({
  className,
  color = "shale",
  children,
}: GradientAnimationsProps) {
  return (
    <div
      className={cn("relative animate-gradient", className)}
      style={{
        background: `linear-gradient(90deg, ${getColorVariable(color, "dark")}, ${getColorVariable(color, "light")}, ${getColorVariable(color, "dark")})`,
        backgroundSize: "200% 200%",
      }}
    >
      {children}
    </div>
  );
}
