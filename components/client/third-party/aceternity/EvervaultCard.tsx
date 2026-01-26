/**
 * Evervault Card
 * Source: https://ui.aceternity.com/components/evervault-card
 */

"use client";

import { getColorVariable, type DigitalGardenColor } from "@/lib/third-party";
import { cn } from "@/lib/core/utils";

export interface EvervaultCardProps {
  className?: string;
  color?: DigitalGardenColor;
  children?: React.ReactNode;
}

export function EvervaultCard({
  className,
  color = "shale",
  children,
}: EvervaultCardProps) {
  return (
    <div
      className={cn(
        "relative flex h-full w-full flex-col items-center justify-center overflow-hidden rounded-xl border",
        className
      )}
      style={{
        borderColor: getColorVariable(color, "mid"),
      }}
    >
      {children}
    </div>
  );
}
