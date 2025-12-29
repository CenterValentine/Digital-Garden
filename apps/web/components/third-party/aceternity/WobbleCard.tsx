/**
 * Wobble Card
 * Source: https://ui.aceternity.com/components/wobble-card
 */

"use client";

import { getColorVariable, type DigitalGardenColor } from "@/lib/third-party";
import { cn } from "@/lib/utils";

export interface WobbleCardProps {
  className?: string;
  color?: DigitalGardenColor;
  children?: React.ReactNode;
}

export function WobbleCard({
  className,
  color = "shale",
  children,
}: WobbleCardProps) {
  return (
    <div
      className={cn("relative rounded-xl", className)}
      style={{
        backgroundColor: getColorVariable(color, "primary"),
      }}
    >
      {children}
    </div>
  );
}
