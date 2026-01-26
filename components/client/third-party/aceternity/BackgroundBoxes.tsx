/**
 * Background Boxes
 * Source: https://ui.aceternity.com/components/background-boxes
 */

"use client";

import { getColorVariable, type DigitalGardenColor } from "@/lib/third-party";
import { cn } from "@/lib/utils";

export interface BackgroundBoxesProps {
  className?: string;
  color?: DigitalGardenColor;
  children?: React.ReactNode;
}

export function BackgroundBoxes({
  className,
  color = "shale",
  children,
}: BackgroundBoxesProps) {
  return (
    <div
      className={cn(
        "relative grid grid-cols-4 gap-4",
        className
      )}
    >
      {Array.from({ length: 16 }).map((_, i) => (
        <div
          key={i}
          className="aspect-square rounded-lg"
          style={{
            backgroundColor: getColorVariable(color, i % 3 === 0 ? "dark" : i % 3 === 1 ? "mid" : "light"),
            opacity: 0.1 + (i % 4) * 0.1,
          }}
        />
      ))}
      {children}
    </div>
  );
}
