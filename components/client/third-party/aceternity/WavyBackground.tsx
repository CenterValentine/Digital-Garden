/**
 * Wavy Background
 * Source: https://ui.aceternity.com/components/wavy-background
 */

"use client";

import { getColorVariable, type DigitalGardenColor } from "@/lib/design/integrations";
import { cn } from "@/lib/core/utils";

export interface WavyBackgroundProps {
  className?: string;
  color?: DigitalGardenColor;
  children?: React.ReactNode;
}

export function WavyBackground({
  className,
  color = "shale",
  children,
}: WavyBackgroundProps) {
  return (
    <div className={cn("relative", className)}>
      <svg
        className="absolute bottom-0 left-0 w-full h-auto"
        viewBox="0 0 1440 320"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M0,96L48,112C96,128,192,160,288,160C384,160,480,128,576,122.7C672,117,768,139,864,154.7C960,171,1056,181,1152,165.3C1248,149,1344,107,1392,85.3L1440,64L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z"
          fill={getColorVariable(color, "primary")}
        />
      </svg>
      {children}
    </div>
  );
}
