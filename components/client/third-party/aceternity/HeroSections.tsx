/**
 * Hero Sections
 * Source: https://ui.aceternity.com/components/hero-sections
 */

"use client";

import { getColorVariable, type DigitalGardenColor } from "@/lib/third-party";
import { cn } from "@/lib/core/utils";

export interface HeroSectionsProps {
  className?: string;
  color?: DigitalGardenColor;
  children?: React.ReactNode;
}

export function HeroSections({
  className,
  color = "shale",
  children,
}: HeroSectionsProps) {
  return (
    <section
      className={cn(
        "relative min-h-screen flex items-center justify-center",
        className
      )}
      style={{
        background: `linear-gradient(135deg, ${getColorVariable(color, "dark")}, ${getColorVariable(color, "light")})`,
      }}
    >
      {children}
    </section>
  );
}
