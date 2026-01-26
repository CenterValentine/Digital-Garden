/**
 * Gradient Background Demo
 * Source: https://animate-ui.com/docs/components/backgrounds/gradient
 * Gradient background effect with smooth animated transitions
 */

"use client";


import { GradientBackground } from "./components/backgrounds/gradient";
import { cn } from "@/lib/core/utils";
import {
  type DigitalGardenColor,
  type ColorVariant,
} from "@/lib/third-party/colors";
import React from "react";

export interface GradientBackgroundDemoProps extends React.ComponentProps<"div"> {
  className?: string;
  color?: DigitalGardenColor;
  colorVariant?: ColorVariant;
  transition?: {
    duration?: number;
    ease?:
      | "linear"
      | "easeIn"
      | "easeOut"
      | "easeInOut"
      | [number, number, number, number];
    repeat?: number | "Infinity";
  };
}

export function GradientBackgroundDemo({
  className,
  color = "gold",
  colorVariant = "primary",
  transition,
  ...props
}: GradientBackgroundDemoProps) {
  return (
    <div
      className={cn("relative w-full h-full", className)}
      style={{ height: "100%" }}
      {...props}
    >
      <GradientBackground
        className="absolute inset-0 w-full h-full"
        color={color}
        colorVariant={colorVariant}
        transition={transition}
      />
    </div>
  );
}
