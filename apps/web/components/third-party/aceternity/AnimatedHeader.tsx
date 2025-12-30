/**
 * Animated Header
 * Source: https://ui.aceternity.com/components/animated-header
 */

"use client";

import { getColorVariable, type DigitalGardenColor } from "@/lib/third-party";
import { cn } from "@/lib/utils";

export interface AnimatedHeaderProps {
  className?: string;
  color?: DigitalGardenColor;
  children?: React.ReactNode;
}

export function AnimatedHeader({
  className,
  color = "shale",
  children,
}: AnimatedHeaderProps) {
  return (
    <header
      className={cn("sticky top-0 z-50 transition-all", className)}
      style={{
        backgroundColor: getColorVariable(color, "primary"),
      }}
    >
      {children}
    </header>
  );
}
