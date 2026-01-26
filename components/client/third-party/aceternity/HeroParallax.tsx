/**
 * Hero Parallax
 * Source: https://ui.aceternity.com/components/hero-parallax
 */

"use client";

import { getColorVariable, type DigitalGardenColor } from "@/lib/third-party";
import { cn } from "@/lib/core/utils";

export interface HeroParallaxProps {
  className?: string;
  color?: DigitalGardenColor;
  children?: React.ReactNode;
}

export function HeroParallax({
  className,
  color = "shale",
  children,
}: HeroParallaxProps) {
  return <div className={cn("relative", className)}>{children}</div>;
}
