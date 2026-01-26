/**
 * Aurora Background
 * Source: https://ui.aceternity.com/components/aurora-background
 */

"use client";

import { getColorVariable, type DigitalGardenColor } from "@/lib/third-party";
import { cn } from "@/lib/core/utils";

export interface AuroraBackgroundProps {
  className?: string;
  color?: DigitalGardenColor;
  children?: React.ReactNode;
}

export function AuroraBackground({
  className,
  color = "shale",
  children,
}: AuroraBackgroundProps) {
  return (
    <div className={cn("relative overflow-hidden", className)}>
      <div
        className="absolute inset-0 opacity-30"
        style={{
          background: `radial-gradient(circle at 50% 50%, ${getColorVariable(color, "primary")}, transparent 70%)`,
        }}
      />
      {children}
    </div>
  );
}
