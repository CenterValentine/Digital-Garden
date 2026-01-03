/**
 * Fireworks Background Demo
 * Source: https://animate-ui.com/docs/components/backgrounds/fireworks
 * Fireworks background with automatic launches and click-to-explode
 */

"use client";

import { FireworksBackground } from "./components/backgrounds/fireworks";
import { cn } from "@/lib/utils";
import {
  getColorAsHsl,
  type DigitalGardenColor,
  type ColorVariant,
} from "@/lib/third-party/colors";
import { useMemo } from "react";

export interface FireworksBackgroundDemoProps extends React.ComponentProps<"div"> {
  className?: string;
  color?: DigitalGardenColor;
  colorVariant?: ColorVariant;
  population?: number;
  fireworkSpeed?: { min: number; max: number } | number;
  fireworkSize?: { min: number; max: number } | number;
  particleSpeed?: { min: number; max: number } | number;
  particleSize?: { min: number; max: number } | number;
}

export function FireworksBackgroundDemo({
  className,
  color = "gold",
  colorVariant = "primary",
  population = 1,
  fireworkSpeed = { min: 4, max: 8 },
  fireworkSize = { min: 2, max: 5 },
  particleSpeed = { min: 2, max: 7 },
  particleSize = { min: 1, max: 5 },
  ...props
}: FireworksBackgroundDemoProps) {
  const fireworkColor = useMemo(() => {
    return getColorAsHsl(color, colorVariant);
  }, [color, colorVariant]);

  return (
    <div
      className={cn("relative w-full h-full", className)}
      style={{ height: "100%" }}
      {...props}
    >
      <FireworksBackground
        className="absolute inset-0 w-full h-full"
        color={fireworkColor}
        population={population}
        fireworkSpeed={fireworkSpeed}
        fireworkSize={fireworkSize}
        particleSpeed={particleSpeed}
        particleSize={particleSize}
      />
    </div>
  );
}
