/**
 * Feature Sections
 * Source: https://ui.aceternity.com/components/feature-sections
 */

"use client";

import { getColorVariable, type DigitalGardenColor } from "@/lib/third-party";
import { cn } from "@/lib/core/utils";

export interface FeatureSectionsProps {
  className?: string;
  color?: DigitalGardenColor;
  children?: React.ReactNode;
}

export function FeatureSections({
  className,
  color = "shale",
  children,
}: FeatureSectionsProps) {
  return <section className={cn("py-16", className)}>{children}</section>;
}
