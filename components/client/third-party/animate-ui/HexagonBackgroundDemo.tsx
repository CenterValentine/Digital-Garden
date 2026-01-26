/**
 * Hexagon Background Demo
 * Source: https://animate-ui.com/docs/components/backgrounds/hexagon
 * Hexagon background effect with smooth animated transitions
 */

"use client";

import { HexagonBackground } from "./components/backgrounds/hexagon";
import { cn } from "@/lib/core/utils";
import {
  type DigitalGardenColor,
  type ColorVariant,
} from "@/lib/design/integrations/colors";
import React from "react";

export interface HexagonBackgroundDemoProps extends React.ComponentProps<"div"> {
  className?: string;
  hexagonSize?: number;
  hexagonMargin?: number;
  hexagonProps?: React.ComponentProps<"div">;
  color?: DigitalGardenColor;
  colorVariant?: ColorVariant;
}

export function HexagonBackgroundDemo({
  className,
  hexagonSize = 75,
  hexagonMargin = 3,
  hexagonProps,
  color = "gold",
  colorVariant = "primary",
  ...props
}: HexagonBackgroundDemoProps) {
  return (
    <div
      className={cn("relative w-full h-full", className)}
      style={{ height: "100%" }}
      {...props}
    >
      <HexagonBackground
        className="absolute inset-0 w-full h-full"
        hexagonSize={hexagonSize}
        hexagonMargin={hexagonMargin}
        hexagonProps={hexagonProps}
        color={color}
        colorVariant={colorVariant}
      />
    </div>
  );
}
