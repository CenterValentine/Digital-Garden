/**
 * Expandable Card
 * Source: https://ui.aceternity.com/components/expandable-card
 * Full screen modal expansion
 */

"use client";

import { getColorVariable, type DigitalGardenColor } from "@/lib/third-party";
import { cn } from "@/lib/core/utils";

export interface ExpandableCardProps {
  className?: string;
  color?: DigitalGardenColor;
  children?: React.ReactNode;
}

export function ExpandableCard({
  className,
  color = "shale",
  children,
}: ExpandableCardProps) {
  return (
    <div
      className={cn(
        "relative rounded-xl transition-all duration-300",
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
