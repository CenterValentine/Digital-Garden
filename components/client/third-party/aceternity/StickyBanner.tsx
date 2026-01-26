/**
 * Sticky Banner
 * Source: https://ui.aceternity.com/components/sticky-banner
 * Hides on scroll
 */

"use client";

import { getColorVariable, type DigitalGardenColor } from "@/lib/design/integrations";
import { cn } from "@/lib/core/utils";

export interface StickyBannerProps {
  className?: string;
  color?: DigitalGardenColor;
  children?: React.ReactNode;
}

export function StickyBanner({
  className,
  color = "shale",
  children,
}: StickyBannerProps) {
  return (
    <div
      className={cn(
        "sticky top-0 z-50 w-full transition-transform duration-300",
        className
      )}
      style={{
        backgroundColor: getColorVariable(color, "primary"),
      }}
    >
      {children}
    </div>
  );
}
