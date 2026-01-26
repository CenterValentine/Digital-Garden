/**
 * Cards Sections
 * Source: https://ui.aceternity.com/components/cards
 * Multiple use cases
 */

"use client";

import { getColorVariable, type DigitalGardenColor } from "@/lib/design/integrations";
import { cn } from "@/lib/core/utils";

export interface CardsSectionsProps {
  className?: string;
  color?: DigitalGardenColor;
  children?: React.ReactNode;
}

export function CardsSections({
  className,
  color = "shale",
  children,
}: CardsSectionsProps) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4",
        className
      )}
    >
      {children}
    </div>
  );
}
