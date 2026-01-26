/**
 * Gradient Background
 * Source: https://animate-ui.com/docs/components/backgrounds/gradient
 * Animated gradient background with smooth color transitions
 */

"use client";

import React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/core/utils";
import {
  getColorVariable,
  type DigitalGardenColor,
  type ColorVariant,
} from "@/lib/design/integrations/colors";

export interface GradientBackgroundProps {
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

export const GradientBackground: React.FC<GradientBackgroundProps> = ({
  className,
  color = "gold",
  colorVariant = "primary",
  transition = {
    duration: 15,
    ease: "easeInOut",
    repeat: Infinity,
  },
}) => {
  // Get color variants for gradient
  const primaryColor = getColorVariable(color, colorVariant);
  const darkColor = getColorVariable(color, "dark");
  const lightColor = getColorVariable(color, "light");
  const brightColor = getColorVariable(color, "bright");

  // Build gradient stops based on available color variants
  const gradientColors = [
    darkColor || primaryColor,
    primaryColor,
    lightColor || primaryColor,
    brightColor || primaryColor,
    primaryColor,
    darkColor || primaryColor,
  ].filter(Boolean);

  // Create gradient string
  const gradientString = `linear-gradient(135deg, ${gradientColors.join(", ")})`;

  return (
    <motion.div
      className={cn("absolute inset-0 w-full h-full", className)}
      style={{
        background: gradientString,
        backgroundSize: "400% 400%",
      }}
      animate={{
        backgroundPosition: [
          "0% 0%",
          "100% 0%",
          "100% 100%",
          "0% 100%",
          "0% 0%",
        ],
      }}
      transition={{
        duration: transition.duration || 15,
        ease: transition.ease || "easeInOut",
        repeat:
          transition.repeat === "Infinity"
            ? Infinity
            : transition.repeat || Infinity,
        repeatType: "loop",
      }}
    />
  );
};
