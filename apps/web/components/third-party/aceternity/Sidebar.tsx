/**
 * Sidebar
 * Source: https://ui.aceternity.com/components/sidebar
 * Expandable on hover
 */

"use client";

import { getColorVariable, type DigitalGardenColor } from "@/lib/third-party";
import { cn } from "@/lib/utils";

export interface SidebarProps {
  className?: string;
  color?: DigitalGardenColor;
  children?: React.ReactNode;
}

export function Sidebar({
  className,
  color = "shale",
  children,
}: SidebarProps) {
  return (
    <aside
      className={cn(
        "fixed left-0 top-0 h-full transition-all duration-300 hover:w-64",
        className
      )}
      style={{
        backgroundColor: getColorVariable(color, "dark"),
      }}
    >
      {children}
    </aside>
  );
}
