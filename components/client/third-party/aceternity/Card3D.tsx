/**
 * 3D Card Effect ⭐
 * Source: https://ui.aceternity.com/components/3d-card-effect
 */

"use client";

import {
  getColorVariable,
  type DigitalGardenColor,
  type DigitalGardenIntent,
} from "@/lib/third-party";
import { cn } from "@/lib/core/utils";

export interface Card3DProps {
  className?: string;
  color?: DigitalGardenColor;
  intent?: DigitalGardenIntent;
  children?: React.ReactNode;
}

export function Card3D({
  className,
  color = "shale",
  intent,
  children,
}: Card3DProps) {
  return (
    <div
      className={cn("group relative h-96 w-full rounded-xl", className)}
      style={{
        transformStyle: "preserve-3d",
      }}
    >
      <div
        className="absolute inset-0 rounded-xl"
        style={{
          background: intent
            ? `linear-gradient(135deg, ${getColorVariable(color, "dark")}, ${getColorVariable(color, "light")})`
            : `linear-gradient(135deg, var(--intent-${intent || "primary"}), var(--intent-${intent || "primary"}))`,
        }}
      />
      {children}
    </div>
  );
}
