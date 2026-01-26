/**
 * Macbook Scroll
 * Source: https://ui.aceternity.com/components/macbook-scroll
 */

"use client";

import { getColorVariable, type DigitalGardenColor } from "@/lib/design/integrations";
import { cn } from "@/lib/core/utils";

export interface MacbookScrollProps {
  className?: string;
  color?: DigitalGardenColor;
  children?: React.ReactNode;
}

export function MacbookScroll({
  className,
  color = "shale",
  children,
}: MacbookScrollProps) {
  return <div className={cn("relative", className)}>{children}</div>;
}
