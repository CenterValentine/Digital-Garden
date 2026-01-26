/**
 * Animated Tabs
 * Source: https://ui.aceternity.com/components/tabs
 * Background animation
 */

"use client";

import { getColorVariable, type DigitalGardenColor } from "@/lib/design/integrations";
import { cn } from "@/lib/core/utils";

export interface AnimatedTabsProps {
  className?: string;
  color?: DigitalGardenColor;
  tabs?: string[];
  activeTab?: string;
  onTabChange?: (tab: string) => void;
  children?: React.ReactNode;
}

export function AnimatedTabs({
  className,
  color = "shale",
  tabs = [],
  activeTab,
  onTabChange,
  children,
}: AnimatedTabsProps) {
  return (
    <div className={cn("flex gap-2", className)}>
      {tabs.map((tab) => (
        <button
          key={tab}
          className={cn(
            "px-4 py-2 rounded-md transition-all",
            activeTab === tab && "font-semibold"
          )}
          style={{
            backgroundColor:
              activeTab === tab
                ? getColorVariable(color, "primary")
                : "transparent",
            color:
              activeTab === tab ? "white" : getColorVariable(color, "primary"),
          }}
          onClick={() => onTabChange?.(tab)}
        >
          {tab}
        </button>
      ))}
      {children}
    </div>
  );
}
