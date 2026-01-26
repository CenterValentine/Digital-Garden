/**
 * Gravity Stars Background
 * Source: https://animate-ui.com/docs/components/backgrounds/gravity-stars
 * Gravity stars background effect with mouse interaction
 */

"use client";

import { GravityStarsBackground } from "./components/backgrounds/gravity-stars";
import { cn } from "@/lib/core/utils";
import {
  type DigitalGardenColor,
  type ColorVariant,
} from "@/lib/design/integrations/colors";
import React from "react";

export interface GravityStarsBackgroundDemoProps extends React.ComponentProps<"div"> {
  className?: string;
  starsCount?: number;
  starsSize?: number;
  starsOpacity?: number;
  glowIntensity?: number;
  movementSpeed?: number;
  mouseInfluence?: number;
  mouseGravity?: "attract" | "repel";
  gravityStrength?: number;
  starsInteraction?: boolean;
  starsInteractionType?: "bounce" | "merge";
  color?: DigitalGardenColor;
  colorVariant?: ColorVariant;
}

export function GravityStarsBackgroundDemo({
  className,
  starsCount = 75,
  starsSize = 2,
  starsOpacity = 0.75,
  glowIntensity = 5,
  movementSpeed = 1,
  mouseInfluence = 100,
  mouseGravity = "attract",
  gravityStrength = 100,
  starsInteraction = false,
  starsInteractionType = "bounce",
  color = "gold",
  colorVariant = "primary",
  ...props
}: GravityStarsBackgroundDemoProps) {
  return (
    <div
      className={cn("relative w-full h-full", className)}
      style={{ height: "100%" }}
      {...props}
    >
      <GravityStarsBackground
        className="absolute inset-0 w-full h-full"
        starsCount={starsCount}
        starsSize={starsSize}
        starsOpacity={starsOpacity}
        glowIntensity={glowIntensity}
        movementSpeed={movementSpeed}
        mouseInfluence={mouseInfluence}
        mouseGravity={mouseGravity}
        gravityStrength={gravityStrength}
        starsInteraction={starsInteraction}
        starsInteractionType={starsInteractionType}
        color={color}
        colorVariant={colorVariant}
      />
    </div>
  );
}
