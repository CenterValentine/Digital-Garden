/**
 * Draggable Card
 * Source: https://ui.aceternity.com/components/draggable-card
 * Drag and drop
 */

"use client";

import { getColorVariable, type DigitalGardenColor } from "@/lib/design/integrations";
import { cn } from "@/lib/core/utils";

export interface DraggableCardProps {
  className?: string;
  color?: DigitalGardenColor;
  children?: React.ReactNode;
}

export function DraggableCard({
  className,
  color = "shale",
  children,
}: DraggableCardProps) {
  return (
    <div
      className={cn(
        "relative cursor-grab active:cursor-grabbing rounded-xl",
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
