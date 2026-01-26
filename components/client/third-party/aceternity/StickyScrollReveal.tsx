/**
 * Sticky Scroll Reveal
 * Source: https://ui.aceternity.com/components/sticky-scroll-reveal
 */

"use client";

import { getColorVariable, type DigitalGardenColor } from "@/lib/design/integrations";
import { cn } from "@/lib/core/utils";

export interface StickyScrollRevealProps {
  className?: string;
  color?: DigitalGardenColor;
  children?: React.ReactNode;
}

export function StickyScrollReveal({
  className,
  color = "shale",
  children,
}: StickyScrollRevealProps) {
  return <div className={cn("sticky top-0", className)}>{children}</div>;
}
