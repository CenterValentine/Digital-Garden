/**
 * Noise Background ⭐⭐
 * Source: https://ui.aceternity.com/components/noise-background
 * Dynamic with animated gradients
 */

"use client";

import { getColorVariable, type DigitalGardenColor } from "@/lib/design/integrations";
import { cn } from "@/lib/core/utils";

export interface NoiseBackgroundProps {
  className?: string;
  color?: DigitalGardenColor;
  children?: React.ReactNode;
}

export function NoiseBackground({
  className,
  color = "shale",
  children,
}: NoiseBackgroundProps) {
  return (
    <div className={cn("relative", className)}>
      <div
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
          backgroundColor: getColorVariable(color, "primary"),
        }}
      />
      {children}
    </div>
  );
}
