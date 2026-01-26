/**
 * Tailwind CSS Buttons
 * Source: https://ui.aceternity.com/components/tailwindcss-buttons
 * Curated collection
 */

"use client";

import {
  getColorVariable,
  getIntentColor,
  type DigitalGardenColor,
  type DigitalGardenIntent,
} from "@/lib/design/integrations";
import { cn } from "@/lib/core/utils";

export interface TailwindCSSButtonsProps {
  className?: string;
  color?: DigitalGardenColor;
  intent?: DigitalGardenIntent;
  variant?: "default" | "outline" | "ghost";
  children?: React.ReactNode;
  onClick?: () => void;
}

export function TailwindCSSButtons({
  className,
  color = "shale",
  intent,
  variant = "default",
  children,
  onClick,
}: TailwindCSSButtonsProps) {
  const baseStyles = "px-4 py-2 rounded-md font-medium transition-all";

  const variantStyles = {
    default: {
      backgroundColor: intent
        ? getIntentColor(intent)
        : getColorVariable(color, "primary"),
      color: "white",
    },
    outline: {
      border: `2px solid ${intent ? getIntentColor(intent) : getColorVariable(color, "primary")}`,
      color: intent
        ? getIntentColor(intent)
        : getColorVariable(color, "primary"),
      backgroundColor: "transparent",
    },
    ghost: {
      color: intent
        ? getIntentColor(intent)
        : getColorVariable(color, "primary"),
      backgroundColor: "transparent",
    },
  };

  return (
    <button
      className={cn(baseStyles, className)}
      style={variantStyles[variant]}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
