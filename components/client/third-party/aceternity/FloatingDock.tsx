/**
 * Floating Dock
 * Source: https://ui.aceternity.com/components/floating-dock
 * Mac OS style
 */

"use client";

import { getColorVariable, type DigitalGardenColor } from "@/lib/third-party";
import { cn } from "@/lib/core/utils";

export interface FloatingDockProps {
  className?: string;
  color?: DigitalGardenColor;
  children?: React.ReactNode;
}

export function FloatingDock({
  className,
  color = "shale",
  children,
}: FloatingDockProps) {
  return (
    <div
      className={cn(
        "fixed bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 rounded-full backdrop-blur-lg",
        className
      )}
      style={{
        backgroundColor: `${getColorVariable(color, "primary")}20`,
        border: `1px solid ${getColorVariable(color, "primary")}40`,
      }}
    >
      {children}
    </div>
  );
}
