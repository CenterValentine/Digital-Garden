/**
 * Hole Background Demo
 * Source: https://animate-ui.com/docs/components/backgrounds/hole
 * Hole background effect with smooth animated transitions
 */

"use client";

import {
  HoleBackground,
  type HoleBackgroundRef,
} from "@/components/client/third-party/animate-ui/components/backgrounds/hole";
import { cn } from "@/lib/core/utils";
import {
  getColorAsHex,
  getColorAsRgb,
  type DigitalGardenColor,
  type ColorVariant,
} from "@/lib/third-party/colors";
import { useEffect, useState } from "react";
import React from "react";

export interface HoleBackgroundDemoProps extends React.ComponentProps<"div"> {
  className?: string;
  color?: DigitalGardenColor;
  colorVariant?: ColorVariant;
  numberOfLines?: number;
  numberOfDiscs?: number;
  reverse?: boolean;
}

export const HoleBackgroundDemo = React.forwardRef<
  HoleBackgroundRef,
  HoleBackgroundDemoProps
>(function HoleBackgroundDemo(
  {
    className,
    color = "gold",
    colorVariant = "primary",
    numberOfLines = 50,
    numberOfDiscs = 50,
    reverse = false,
    ...props
  },
  ref
) {
  const [strokeColor, setStrokeColor] = useState<string>("#737373");
  const [particleRGBColor, setParticleRGBColor] = useState<
    [number, number, number]
  >([255, 255, 255]);

  useEffect(() => {
    setStrokeColor(getColorAsHex(color, colorVariant));
    setParticleRGBColor(getColorAsRgb(color, colorVariant));
  }, [color, colorVariant]);

  return (
    <div
      className={cn("relative w-full h-full", className)}
      style={{ height: "100%" }}
      {...props}
    >
      <HoleBackground
        ref={ref}
        className="absolute inset-0 w-full h-full"
        strokeColor={strokeColor}
        particleRGBColor={particleRGBColor}
        numberOfLines={numberOfLines}
        numberOfDiscs={numberOfDiscs}
        horizontalLineColor={strokeColor}
        reverse={reverse}
      />
    </div>
  );
});
