/**
 * Bento Grid ⭐
 * Source: https://ui.aceternity.com/components/bento-grid
 * Skewed layout
 */

"use client";

import { getColorVariable, type DigitalGardenColor } from "@/lib/third-party";
import { cn } from "@/lib/utils";

export interface BentoGridProps {
  className?: string;
  color?: DigitalGardenColor;
  children?: React.ReactNode;
}

export function BentoGrid({
  className,
  color = "shale",
  children,
}: BentoGridProps) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4",
        className
      )}
    >
      {children}
    </div>
  );
}
